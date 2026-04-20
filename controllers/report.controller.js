// controllers/report.controller.js
// Generates reports and handles data export.
//
// Routes:
// GET /api/reports/enrollments           — enrollment report with filters
// GET /api/reports/payments              — payment summary report
// GET /api/reports/institutes            — institute comparison report
// GET /api/reports/enrollments/export    — export enrollment report to Excel
// GET /api/reports/payments/export       — export payment report to Excel
//
// Design decisions:
// — Reports are read-only — no data mutation
// — All reports support the same filter params
//   as the list endpoints for consistency
// — Excel export uses exceljs for clean formatting
// — PDF export generates styled HTML sent as
//   a downloadable file — no heavy PDF library needed
// — Only root and admin can export reports

import Enrollment from "../models/Enrollment.model.js";
import Payment from "../models/Payment.model.js";
import Institute from "../models/Institute.model.js";
import ExcelJS from "exceljs";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ─────────────────────────────────────────
// Helper — build enrollment filter from
// query params — reused by report and export
// ─────────────────────────────────────────
const buildEnrollmentFilter = (query, tenantId) => {
  const {
    courseId,
    instituteId,
    status,
    result,
    month,
    year,
    candidateId,
  } = query;

  const filter = { tenantId, isDeleted: false };

  if (courseId) filter.courseId = courseId;
  if (instituteId) filter.instituteId = instituteId;
  if (status) filter.status = status;
  if (result) filter.result = result;
  if (month) filter.enrollmentMonth = parseInt(month, 10);
  if (year) filter.enrollmentYear = parseInt(year, 10);
  if (candidateId) filter.candidateId = candidateId;

  return filter;
};

// ─────────────────────────────────────────
// @route   GET /api/reports/enrollments
// @access  All roles
// @desc    Enrollment report with full filters
//          Supports all filter combinations:
//          ?courseId=&instituteId=&status=
//          &result=&month=&year=&candidateId=
//          &page=1&limit=50
// ─────────────────────────────────────────
const getEnrollmentReport = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const filter = buildEnrollmentFilter(req.query, req.tenantId);

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate("candidateId", "fullName mobile email currentCompany referredBy")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .populate("createdBy", "name")
      .select("-checklist")
      .sort({ enrollmentYear: -1, enrollmentMonth: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Enrollment.countDocuments(filter),
  ]);

  // Build summary statistics for the filtered set
  const stats = await Enrollment.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalEnrollments: { $sum: 1 },
        passed: {
          $sum: { $cond: [{ $eq: ["$result", "pass"] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ["$result", "fail"] }, 1, 0] },
        },
        certificatesSent: {
          $sum: { $cond: ["$certificateSent", 1, 0] },
        },
      },
    },
  ]);

  const summary = stats[0] || {
    totalEnrollments: 0,
    passed: 0,
    failed: 0,
    certificatesSent: 0,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        enrollments,
        summary,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Enrollment report fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/reports/payments
// @access  All roles
// @desc    Payment summary report
//          Shows fee, paid, balance per enrollment
//          Supports filters:
//          ?courseId=&instituteId=&year=&month=
// ─────────────────────────────────────────
const getPaymentReport = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const enrollmentFilter = buildEnrollmentFilter(req.query, req.tenantId);

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Get matching enrollment IDs first
  const enrollmentIds = await Enrollment.find(enrollmentFilter)
    .select("_id")
    .lean();

  const ids = enrollmentIds.map((e) => e._id);

  const paymentFilter = {
    tenantId: req.tenantId,
    isDeleted: false,
    enrollmentId: { $in: ids },
  };

  const [payments, total] = await Promise.all([
    Payment.find(paymentFilter)
      .populate("candidateId", "fullName mobile email")
      .populate({
        path: "enrollmentId",
        select: "status courseId instituteId enrollmentMonth enrollmentYear",
        populate: [
          { path: "courseId", select: "name shortCode" },
          { path: "instituteId", select: "name" },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Payment.countDocuments(paymentFilter),
  ]);

  // Calculate summary for each payment
  const paymentsWithSummary = payments.map((payment) => {
    const totalPaid = payment.transactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const totalExpenses = payment.expenses.reduce(
      (sum, e) => sum + e.amount,
      0
    );
    const remainingBalance = payment.totalFeeCharged - totalPaid;
    const amountSaved = totalPaid - totalExpenses;

    let paymentStatus = "partial";
    if (totalPaid >= payment.totalFeeCharged && payment.totalFeeCharged > 0) {
      paymentStatus = "complete";
    } else if (
      payment.paymentDeadline &&
      new Date() > new Date(payment.paymentDeadline) &&
      totalPaid < payment.totalFeeCharged
    ) {
      paymentStatus = "overdue";
    } else if (totalPaid === 0) {
      paymentStatus = "unpaid";
    }

    return {
      ...payment.toObject(),
      totalPaid,
      totalExpenses,
      remainingBalance,
      amountSaved,
      paymentStatus,
    };
  });

  // Overall financial summary
  const totals = paymentsWithSummary.reduce(
    (acc, p) => {
      acc.totalFeeCharged += p.totalFeeCharged;
      acc.totalPaid += p.totalPaid;
      acc.totalExpenses += p.totalExpenses;
      acc.totalOutstanding += p.remainingBalance > 0 ? p.remainingBalance : 0;
      return acc;
    },
    {
      totalFeeCharged: 0,
      totalPaid: 0,
      totalExpenses: 0,
      totalOutstanding: 0,
    }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        payments: paymentsWithSummary,
        totals,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Payment report fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/reports/institutes
// @access  All roles
// @desc    Institute comparison report
//          Shows pass rate, avg result days,
//          total enrollments per institute
// ─────────────────────────────────────────
const getInstituteReport = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const [institutes, enrollmentStats] = await Promise.all([
    // All active institutes
    Institute.find({
      tenantId,
      isDeleted: false,
      isActive: true,
    })
      .populate("coursesOffered.courseId", "name shortCode")
      .select("name coursesOffered"),

    // Enrollment statistics per institute
    Enrollment.aggregate([
      {
        $match: { tenantId, isDeleted: false },
      },
      {
        $group: {
          _id: "$instituteId",
          totalEnrollments: { $sum: 1 },
          passed: {
            $sum: { $cond: [{ $eq: ["$result", "pass"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$result", "fail"] }, 1, 0] },
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  // Merge institute data with enrollment stats
  const result = institutes.map((institute) => {
    const stats = enrollmentStats.find(
      (s) => s._id.toString() === institute._id.toString()
    ) || {
      totalEnrollments: 0,
      passed: 0,
      failed: 0,
      completed: 0,
    };

    const totalResults = stats.passed + stats.failed;
    const passRate =
      totalResults > 0
        ? Math.round((stats.passed / totalResults) * 100)
        : null;

    return {
      instituteId: institute._id,
      instituteName: institute.name,
      coursesOffered: institute.coursesOffered,
      totalEnrollments: stats.totalEnrollments,
      passed: stats.passed,
      failed: stats.failed,
      completed: stats.completed,
      passRate,
    };
  });

  // Sort by pass rate descending — best institutes first
  result.sort((a, b) => {
    if (a.passRate === null) return 1;
    if (b.passRate === null) return -1;
    return b.passRate - a.passRate;
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { institutes: result, total: result.length },
      "Institute comparison report fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/reports/enrollments/export
// @access  Root, Admin
// @desc    Export enrollment report to Excel
//          Supports same filters as enrollment report
//          Returns a downloadable .xlsx file
// ─────────────────────────────────────────
const exportEnrollmentsExcel = asyncHandler(async (req, res) => {
  const filter = buildEnrollmentFilter(req.query, req.tenantId);

  const enrollments = await Enrollment.find(filter)
    .populate("candidateId", "fullName mobile email currentCompany referredBy")
    .populate("courseId", "name shortCode")
    .populate("instituteId", "name")
    .select("-checklist")
    .sort({ enrollmentYear: -1, enrollmentMonth: -1 })
    .limit(5000); // Safety cap — prevent massive exports

  // ─────────────────────────────────────────
  // Build Excel workbook
  // ─────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OHS CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Enrollments", {
    pageSetup: { fitToPage: true, orientation: "landscape" },
  });

  // ─────────────────────────────────────────
  // Define columns
  // ─────────────────────────────────────────
  sheet.columns = [
    { header: "Candidate Name", key: "candidateName", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Company", key: "company", width: 20 },
    { header: "Course", key: "course", width: 15 },
    { header: "Institute", key: "institute", width: 25 },
    { header: "Month", key: "month", width: 10 },
    { header: "Year", key: "year", width: 10 },
    { header: "Status", key: "status", width: 18 },
    { header: "Learner No.", key: "learnerNumber", width: 15 },
    { header: "Result", key: "result", width: 10 },
    { header: "Result Date", key: "resultDate", width: 15 },
    { header: "Certificate Sent", key: "certificateSent", width: 16 },
    { header: "Certificate Via", key: "certificateSentVia", width: 15 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];

  // ─────────────────────────────────────────
  // Style header row
  // ─────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" }, // primary navy color
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // ─────────────────────────────────────────
  // Add data rows
  // ─────────────────────────────────────────
  enrollments.forEach((enrollment, index) => {
    const row = sheet.addRow({
      candidateName: enrollment.candidateId?.fullName || "",
      mobile: enrollment.candidateId?.mobile || "",
      email: enrollment.candidateId?.email || "",
      company: enrollment.candidateId?.currentCompany || "",
      course: enrollment.courseId?.shortCode || "",
      institute: enrollment.instituteId?.name || "",
      month: enrollment.enrollmentMonth || "",
      year: enrollment.enrollmentYear || "",
      status: enrollment.status || "",
      learnerNumber: enrollment.learnerNumber || "",
      result: enrollment.result || "",
      resultDate: enrollment.resultDate
        ? new Date(enrollment.resultDate).toLocaleDateString()
        : "",
      certificateSent: enrollment.certificateSent ? "Yes" : "No",
      certificateSentVia: enrollment.certificateSentVia || "",
      remarks: enrollment.remarks || "",
    });

    // Alternate row colors for readability
    if (index % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF4F6F8" },
      };
    }
  });

  // ─────────────────────────────────────────
  // Add totals row at the bottom
  // ─────────────────────────────────────────
  sheet.addRow([]);
  const totalRow = sheet.addRow({
    candidateName: `Total: ${enrollments.length} enrollments`,
  });
  totalRow.font = { bold: true };

  // ─────────────────────────────────────────
  // Send file as download
  // ─────────────────────────────────────────
  const filename = `enrollments-report-${Date.now()}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

// ─────────────────────────────────────────
// @route   GET /api/reports/payments/export
// @access  Root, Admin
// @desc    Export payment report to Excel
// ─────────────────────────────────────────
const exportPaymentsExcel = asyncHandler(async (req, res) => {
  const enrollmentFilter = buildEnrollmentFilter(req.query, req.tenantId);

  const enrollmentIds = await Enrollment.find(enrollmentFilter)
    .select("_id")
    .lean();

  const ids = enrollmentIds.map((e) => e._id);

  const payments = await Payment.find({
    tenantId: req.tenantId,
    isDeleted: false,
    enrollmentId: { $in: ids },
  })
    .populate("candidateId", "fullName mobile email")
    .populate({
      path: "enrollmentId",
      select: "courseId instituteId enrollmentMonth enrollmentYear status",
      populate: [
        { path: "courseId", select: "name shortCode" },
        { path: "instituteId", select: "name" },
      ],
    })
    .limit(5000);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OHS CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Payments", {
    pageSetup: { fitToPage: true, orientation: "landscape" },
  });

  sheet.columns = [
    { header: "Candidate Name", key: "candidateName", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 },
    { header: "Course", key: "course", width: 15 },
    { header: "Institute", key: "institute", width: 25 },
    { header: "Month", key: "month", width: 10 },
    { header: "Year", key: "year", width: 10 },
    { header: "Total Fee", key: "totalFee", width: 15 },
    { header: "Total Paid", key: "totalPaid", width: 15 },
    { header: "Balance", key: "balance", width: 15 },
    { header: "Total Expenses", key: "totalExpenses", width: 16 },
    { header: "Amount Saved", key: "amountSaved", width: 15 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: "Deadline", key: "deadline", width: 15 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  let grandTotalFee = 0;
  let grandTotalPaid = 0;
  let grandTotalExpenses = 0;

  payments.forEach((payment, index) => {
    const totalPaid = payment.transactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const totalExpenses = payment.expenses.reduce(
      (sum, e) => sum + e.amount,
      0
    );
    const balance = payment.totalFeeCharged - totalPaid;
    const amountSaved = totalPaid - totalExpenses;

    let paymentStatus = "partial";
    if (totalPaid >= payment.totalFeeCharged && payment.totalFeeCharged > 0) {
      paymentStatus = "complete";
    } else if (
      payment.paymentDeadline &&
      new Date() > new Date(payment.paymentDeadline) &&
      totalPaid < payment.totalFeeCharged
    ) {
      paymentStatus = "overdue";
    } else if (totalPaid === 0) {
      paymentStatus = "unpaid";
    }

    grandTotalFee += payment.totalFeeCharged;
    grandTotalPaid += totalPaid;
    grandTotalExpenses += totalExpenses;

    const row = sheet.addRow({
      candidateName: payment.candidateId?.fullName || "",
      mobile: payment.candidateId?.mobile || "",
      course: payment.enrollmentId?.courseId?.shortCode || "",
      institute: payment.enrollmentId?.instituteId?.name || "",
      month: payment.enrollmentId?.enrollmentMonth || "",
      year: payment.enrollmentId?.enrollmentYear || "",
      totalFee: payment.totalFeeCharged,
      totalPaid,
      balance,
      totalExpenses,
      amountSaved,
      paymentStatus,
      deadline: payment.paymentDeadline
        ? new Date(payment.paymentDeadline).toLocaleDateString()
        : "",
    });

    if (index % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF4F6F8" },
      };
    }
  });

  // Totals row
  sheet.addRow([]);
  const totalRow = sheet.addRow({
    candidateName: "TOTALS",
    totalFee: grandTotalFee,
    totalPaid: grandTotalPaid,
    balance: grandTotalFee - grandTotalPaid,
    totalExpenses: grandTotalExpenses,
    amountSaved: grandTotalPaid - grandTotalExpenses,
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF3C7" },
  };

  const filename = `payments-report-${Date.now()}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

export {
  getEnrollmentReport,
  getPaymentReport,
  getInstituteReport,
  exportEnrollmentsExcel,
  exportPaymentsExcel,
};