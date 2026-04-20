// controllers/dashboard.controller.js
// Provides all data needed to power the dashboard.
//
// Routes:
// GET /api/dashboard/summary          — counts and totals
// GET /api/dashboard/enrollments-by-month — chart data
// GET /api/dashboard/pass-fail-ratio  — by course and institute
// GET /api/dashboard/upcoming-dates   — exams and results this week
// GET /api/dashboard/pending-checklist — incomplete steps across enrollments
// GET /api/dashboard/overdue-payments — enrollments with overdue payments
//
// Design decisions:
// — All queries are tenant-scoped via req.tenantId
// — All queries filter isDeleted: false
// — Heavy aggregations use MongoDB aggregation pipeline
//   for performance — no in-memory calculations
// — All routes are read-only — no data mutation here

import Enrollment from "../models/Enrollment.model.js";
import Candidate from "../models/Candidate.model.js";
import Payment from "../models/Payment.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ─────────────────────────────────────────
// @route   GET /api/dashboard/summary
// @access  All roles
// @desc    Returns high-level counts:
//          — total candidates
//          — active enrollments (not completed/failed)
//          — enrollments by status
//          — total pending payments amount
// ─────────────────────────────────────────
const getSummary = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const [
    totalCandidates,
    enrollmentsByStatus,
    paymentSummary,
  ] = await Promise.all([
    // Total active candidates
    Candidate.countDocuments({
      tenantId,
      isDeleted: false,
    }),

    // Enrollment counts grouped by status
    Enrollment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),

    // Total unpaid/partial payment amounts
    Payment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
        },
      },
      {
        $addFields: {
          totalPaid: { $sum: "$transactions.amount" },
        },
      },
      {
        $addFields: {
          remainingBalance: {
            $subtract: ["$totalFeeCharged", "$totalPaid"],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalOutstanding: {
            $sum: {
              $cond: [
                { $gt: ["$remainingBalance", 0] },
                "$remainingBalance",
                0,
              ],
            },
          },
          totalRevenue: { $sum: "$totalPaid" },
          totalFeeCharged: { $sum: "$totalFeeCharged" },
        },
      },
    ]),
  ]);

  // Convert enrollmentsByStatus array to object
  // e.g. { enquiry: 5, admitted: 3, learning: 2 }
  const statusCounts = enrollmentsByStatus.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const totalEnrollments = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const activeEnrollments = Object.entries(statusCounts)
    .filter(([status]) =>
      !["completed", "failed"].includes(status)
    )
    .reduce((sum, [, count]) => sum + count, 0);

  const financials = paymentSummary[0] || {
    totalOutstanding: 0,
    totalRevenue: 0,
    totalFeeCharged: 0,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalCandidates,
        totalEnrollments,
        activeEnrollments,
        enrollmentsByStatus: statusCounts,
        financials: {
          totalRevenue: financials.totalRevenue,
          totalOutstanding: financials.totalOutstanding,
          totalFeeCharged: financials.totalFeeCharged,
        },
      },
      "Dashboard summary fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/dashboard/enrollments-by-month
// @access  All roles
// @desc    Returns enrollment count per month
//          for the current year by default
//          ?year=2025 — specify a year
// ─────────────────────────────────────────
const getEnrollmentsByMonth = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const tenantId = req.tenantId;

  const data = await Enrollment.aggregate([
    {
      $match: {
        tenantId,
        isDeleted: false,
        enrollmentYear: year,
      },
    },
    {
      $group: {
        _id: "$enrollmentMonth",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Build full 12-month array with 0 for missing months
  const months = Array.from({ length: 12 }, (_, i) => {
    const found = data.find((d) => d._id === i + 1);
    return {
      month: i + 1,
      monthName: new Date(year, i, 1).toLocaleString("default", {
        month: "short",
      }),
      count: found ? found.count : 0,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { year, months },
      "Enrollments by month fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/dashboard/pass-fail-ratio
// @access  All roles
// @desc    Returns pass/fail counts grouped by
//          course and by institute
// ─────────────────────────────────────────
const getPassFailRatio = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const [byCourse, byInstitute] = await Promise.all([
    // Pass/fail ratio by course
    Enrollment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          result: { $in: ["pass", "fail"] },
        },
      },
      {
        $group: {
          _id: {
            courseId: "$courseId",
            result: "$result",
          },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "_id.courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      {
        $unwind: "$course",
      },
      {
        $group: {
          _id: "$_id.courseId",
          courseName: { $first: "$course.name" },
          shortCode: { $first: "$course.shortCode" },
          results: {
            $push: {
              result: "$_id.result",
              count: "$count",
            },
          },
        },
      },
    ]),

    // Pass/fail ratio by institute
    Enrollment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          result: { $in: ["pass", "fail"] },
        },
      },
      {
        $group: {
          _id: {
            instituteId: "$instituteId",
            result: "$result",
          },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "institutes",
          localField: "_id.instituteId",
          foreignField: "_id",
          as: "institute",
        },
      },
      {
        $unwind: "$institute",
      },
      {
        $group: {
          _id: "$_id.instituteId",
          instituteName: { $first: "$institute.name" },
          results: {
            $push: {
              result: "$_id.result",
              count: "$count",
            },
          },
        },
      },
    ]),
  ]);

  // Normalize results into { pass: N, fail: N } shape
  const normalize = (items) =>
    items.map((item) => {
      const pass = item.results.find((r) => r.result === "pass")?.count || 0;
      const fail = item.results.find((r) => r.result === "fail")?.count || 0;
      const total = pass + fail;
      const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
      return { ...item, pass, fail, total, passRate, results: undefined };
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        byCourse: normalize(byCourse),
        byInstitute: normalize(byInstitute),
      },
      "Pass/fail ratio fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/dashboard/upcoming-dates
// @access  All roles
// @desc    Returns enrollments with exam dates
//          or result dates in the next 7 days
// ─────────────────────────────────────────
const getUpcomingDates = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  nextWeek.setHours(23, 59, 59, 999);

  const dateRange = { $gte: today, $lte: nextWeek };

  const [ig1, ig2, interviews, results] = await Promise.all([
    // IG-1 dates this week
    Enrollment.find({
      tenantId,
      isDeleted: false,
      ig1Date: dateRange,
    })
      .populate("candidateId", "fullName mobile")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .select("ig1Date status learnerNumber candidateId courseId instituteId")
      .sort({ ig1Date: 1 }),

    // IG-2 dates this week
    Enrollment.find({
      tenantId,
      isDeleted: false,
      ig2Date: dateRange,
    })
      .populate("candidateId", "fullName mobile")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .select("ig2Date status learnerNumber candidateId courseId instituteId")
      .sort({ ig2Date: 1 }),

    // Interview dates this week
    Enrollment.find({
      tenantId,
      isDeleted: false,
      interviewDate: dateRange,
    })
      .populate("candidateId", "fullName mobile")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .select("interviewDate status learnerNumber candidateId courseId instituteId")
      .sort({ interviewDate: 1 }),

    // Result dates this week
    Enrollment.find({
      tenantId,
      isDeleted: false,
      resultDate: dateRange,
    })
      .populate("candidateId", "fullName mobile")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .select("resultDate status result learnerNumber candidateId courseId instituteId")
      .sort({ resultDate: 1 }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ig1Dates: ig1,
        ig2Dates: ig2,
        interviewDates: interviews,
        resultDates: results,
        totalUpcoming:
          ig1.length + ig2.length + interviews.length + results.length,
      },
      "Upcoming dates fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/dashboard/pending-checklist
// @access  All roles
// @desc    Returns enrollments with incomplete
//          required checklist steps
//          Only active enrollments are included
// ─────────────────────────────────────────
const getPendingChecklist = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  // Active statuses — completed and failed are excluded
  const activeStatuses = [
    "enquiry",
    "documents_pending",
    "admitted",
    "learning",
    "exam",
    "awaiting_result",
    "passed",
  ];

  const enrollments = await Enrollment.find({
    tenantId,
    isDeleted: false,
    status: { $in: activeStatuses },
    // Only enrollments that have checklist steps
    "checklist.0": { $exists: true },
  })
    .populate("candidateId", "fullName mobile")
    .populate("courseId", "name shortCode")
    .select("candidateId courseId status checklist");

  // Filter to only enrollments with pending required steps
  const result = enrollments
    .map((enrollment) => {
      const pendingSteps = enrollment.checklist.filter(
        (step) => !step.isDone && !step.skipped
      );

      const pendingRequiredSteps = pendingSteps.filter(
        (step) => step.isRequired
      );

      return {
        enrollmentId: enrollment._id,
        candidate: enrollment.candidateId,
        course: enrollment.courseId,
        status: enrollment.status,
        totalSteps: enrollment.checklist.length,
        completedSteps: enrollment.checklist.filter((s) => s.isDone).length,
        pendingSteps: pendingSteps.length,
        pendingRequiredSteps: pendingRequiredSteps.length,
        pendingStepTitles: pendingSteps.map((s) => s.title),
      };
    })
    .filter((item) => item.pendingSteps > 0)
    .sort((a, b) => b.pendingRequiredSteps - a.pendingRequiredSteps);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        total: result.length,
        enrollments: result,
      },
      "Pending checklist steps fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/dashboard/overdue-payments
// @access  All roles
// @desc    Returns payment records where deadline
//          has passed and balance is still outstanding
// ─────────────────────────────────────────
const getOverduePayments = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const now = new Date();

  const overduePayments = await Payment.find({
    tenantId,
    isDeleted: false,
    paymentDeadline: { $lt: now },
  })
    .populate("candidateId", "fullName mobile email")
    .populate("enrollmentId", "status courseId instituteId")
    .sort({ paymentDeadline: 1 });

  // Calculate remaining balance for each
  // and filter out fully paid ones
  const result = overduePayments
    .map((payment) => {
      const totalPaid = payment.transactions.reduce(
        (sum, t) => sum + t.amount,
        0
      );
      const remainingBalance = payment.totalFeeCharged - totalPaid;

      return {
        paymentId: payment._id,
        enrollmentId: payment.enrollmentId,
        candidate: payment.candidateId,
        totalFeeCharged: payment.totalFeeCharged,
        totalPaid,
        remainingBalance,
        paymentDeadline: payment.paymentDeadline,
        daysOverdue: Math.floor(
          (now - new Date(payment.paymentDeadline)) / (1000 * 60 * 60 * 24)
        ),
      };
    })
    .filter((item) => item.remainingBalance > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totalOutstanding = result.reduce(
    (sum, item) => sum + item.remainingBalance,
    0
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        total: result.length,
        totalOutstanding,
        payments: result,
      },
      "Overdue payments fetched successfully"
    )
  );
});

export {
  getSummary,
  getEnrollmentsByMonth,
  getPassFailRatio,
  getUpcomingDates,
  getPendingChecklist,
  getOverduePayments,
};