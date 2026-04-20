// controllers/enrollment.controller.js
// Handles enrollment management and the checklist engine.
//
// Enrollment routes:
// POST   /api/enrollments                        — create enrollment (root, admin, staff)
// GET    /api/enrollments                        — list all enrollments (all roles)
// GET    /api/enrollments/:id                    — get single enrollment (all roles)
// PUT    /api/enrollments/:id                    — update enrollment details (root, admin, staff)
// DELETE /api/enrollments/:id                    — soft delete (root, admin, staff)
//
// Checklist engine routes:
// PUT    /api/enrollments/:id/checklist/:stepId/done    — mark step done
// PUT    /api/enrollments/:id/checklist/:stepId/undone  — mark step undone
// PUT    /api/enrollments/:id/checklist/:stepId/skip    — skip a step
// PUT    /api/enrollments/:id/checklist/:stepId         — update step fields
//
// Key design decisions:
// 1. When enrollment is created, current checklist template
//    is COPIED into the enrollment — template changes never
//    affect existing enrollments
// 2. avgResultDays in Institute is recalculated automatically
//    whenever an enrollment result is recorded
// 3. Status pipeline is managed by the update endpoint —
//    any valid enum value is accepted for flexibility

import Enrollment from "../models/Enrollment.model.js";
import Candidate from "../models/Candidate.model.js";
import Course from "../models/Course.model.js";
import Institute from "../models/Institute.model.js";
import ChecklistTemplate from "../models/ChecklistTemplate.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// Helper — recalculate avgResultDays for a
// course at a specific institute.
// Called automatically when result is recorded.
// ─────────────────────────────────────────
const recalculateAvgResultDays = async (instituteId, courseId) => {
  try {
    // Find all completed enrollments for this
    // institute + course combination that have
    // both enrollmentDate and resultDate set
    const completedEnrollments = await Enrollment.find({
      instituteId,
      courseId,
      isDeleted: false,
      resultDate: { $ne: null },
      enrollmentDate: { $ne: null },
      result: { $in: ["pass", "fail"] },
    }).select("enrollmentDate resultDate");

    if (completedEnrollments.length === 0) return;

    // Calculate average days between enrollment and result
    const totalDays = completedEnrollments.reduce((sum, enrollment) => {
      const diffTime =
        new Date(enrollment.resultDate) - new Date(enrollment.enrollmentDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return sum + diffDays;
    }, 0);

    const avgDays = Math.round(totalDays / completedEnrollments.length);

    // Update avgResultDays for this course at this institute
    await Institute.updateOne(
      {
        _id: instituteId,
        "coursesOffered.courseId": courseId,
      },
      {
        $set: { "coursesOffered.$.avgResultDays": avgDays },
      }
    );
  } catch (error) {
    // Non-critical — log but don't crash the request
    console.error("⚠️  avgResultDays recalculation failed:", error.message);
  }
};

// ─────────────────────────────────────────
// @route   POST /api/enrollments
// @access  Root, Admin, Staff
// @desc    Create a new enrollment
//          Copies current checklist template
//          into the enrollment automatically
// ─────────────────────────────────────────
const createEnrollment = asyncHandler(async (req, res) => {
  const {
    candidateId,
    courseId,
    instituteId,
    enrollmentMonth,
    enrollmentYear,
    enrollmentDate,
    status,
    remarks,
  } = req.body;

  // Validate required fields
  if (!candidateId || !courseId || !instituteId) {
    throw new ApiError(
      400,
      "candidateId, courseId and instituteId are required"
    );
  }

  // Verify candidate exists in this tenant
  const candidate = await Candidate.findOne({
    _id: candidateId,
    tenantId: req.tenantId,
    isDeleted: false,
  });
  if (!candidate) throw new ApiError(404, "Candidate not found");

  // Verify course exists in this tenant
  const course = await Course.findOne({
    _id: courseId,
    tenantId: req.tenantId,
    isDeleted: false,
    isActive: true,
  });
  if (!course) throw new ApiError(404, "Course not found or inactive");

  // Verify institute exists in this tenant
  const institute = await Institute.findOne({
    _id: instituteId,
    tenantId: req.tenantId,
    isDeleted: false,
    isActive: true,
  });
  if (!institute) throw new ApiError(404, "Institute not found or inactive");

  // ─────────────────────────────────────────
  // Copy checklist template into enrollment
  // If no template exists for this course,
  // enrollment is created with empty checklist
  // ─────────────────────────────────────────
  let checklistSteps = [];

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (template && template.steps.length > 0) {
    // Sort steps by order and copy into enrollment
    checklistSteps = template.steps
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        stepId: step._id,
        title: step.title,
        order: step.order,
        isRequired: step.isRequired,
        hasDate: step.hasDate,
        hasAssignedTo: step.hasAssignedTo,
        hasNote: step.hasNote,
        isDone: false,
        doneAt: null,
        doneBy: null,
        skipped: false,
        skipReason: null,
        date: null,
        assignedTo: null,
        note: null,
      }));
  }

  const enrollment = await Enrollment.create({
    tenantId: req.tenantId,
    candidateId,
    courseId,
    instituteId,
    enrollmentMonth: enrollmentMonth || null,
    enrollmentYear: enrollmentYear || null,
    enrollmentDate: enrollmentDate || null,
    status: status || "enquiry",
    checklist: checklistSteps,
    remarks: remarks?.trim() || null,
    createdBy: req.user._id,
  });

  // Populate references for response
  await enrollment.populate([
    { path: "candidateId", select: "fullName mobile email" },
    { path: "courseId", select: "name shortCode" },
    { path: "instituteId", select: "name" },
    { path: "createdBy", select: "name email" },
  ]);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_ENROLLMENT",
    entityType: "enrollment",
    entityId: enrollment._id,
    description: `${req.user.name} created enrollment for ${candidate.fullName} in ${course.name}`,
  });

  return res.status(201).json(
    new ApiResponse(201, enrollment, "Enrollment created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/enrollments
// @access  All roles
// @desc    List all enrollments with filters
//          Supports query params:
//          ?candidateId=  — enrollments for a candidate
//          ?courseId=     — filter by course
//          ?instituteId=  — filter by institute
//          ?status=       — filter by status
//          ?result=       — filter by result
//          ?month=        — filter by enrollment month
//          ?year=         — filter by enrollment year
//          ?page=1&limit=20
// ─────────────────────────────────────────
const getEnrollments = asyncHandler(async (req, res) => {
  const {
    candidateId,
    courseId,
    instituteId,
    status,
    result,
    month,
    year,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { tenantId: req.tenantId };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  if (candidateId) filter.candidateId = candidateId;
  if (courseId) filter.courseId = courseId;
  if (instituteId) filter.instituteId = instituteId;
  if (status) filter.status = status;
  if (result) filter.result = result;
  if (month) filter.enrollmentMonth = parseInt(month, 10);
  if (year) filter.enrollmentYear = parseInt(year, 10);

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate("candidateId", "fullName mobile email")
      .populate("courseId", "name shortCode")
      .populate("instituteId", "name")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select("-checklist"),
    // Exclude checklist from list view —
    // it is only needed in the detail view
    Enrollment.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        enrollments,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Enrollments fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/enrollments/:id
// @access  All roles
// @desc    Get a single enrollment by ID
//          Includes full checklist with all steps
// ─────────────────────────────────────────
const getEnrollmentById = asyncHandler(async (req, res) => {
  const filter = {
    _id: req.params.id,
    tenantId: req.tenantId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const enrollment = await Enrollment.findOne(filter)
    .populate("candidateId", "fullName mobile email nameOnCertificate")
    .populate("courseId", "name shortCode description")
    .populate("instituteId", "name email mobile")
    .populate("createdBy", "name email")
    .populate("checklist.doneBy", "name email");

  if (!enrollment) {
    throw new ApiError(404, "Enrollment not found");
  }

  // Sort checklist steps by order before returning
  enrollment.checklist.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, enrollment, "Enrollment fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/enrollments/:id
// @access  Root, Admin, Staff
// @desc    Update enrollment details
//          Handles status changes, exam dates,
//          result, certificate info, and remarks
//          When result is recorded, avgResultDays
//          is recalculated automatically
// ─────────────────────────────────────────
const updateEnrollment = asyncHandler(async (req, res) => {
  const {
    status,
    enrollmentMonth,
    enrollmentYear,
    enrollmentDate,
    learnerNumber,
    ig1Date,
    ig2Date,
    interviewDate,
    resultDate,
    result,
    certificateSent,
    certificateSentDate,
    certificateSentVia,
    remarks,
    instituteId,
  } = req.body;

  const enrollment = await Enrollment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!enrollment) {
    throw new ApiError(404, "Enrollment not found");
  }

  // Track what changed for activity log
  const changes = {};

  const updates = {};

  if (status !== undefined) {
    const validStatuses = [
      "enquiry", "documents_pending", "admitted", "learning",
      "exam", "awaiting_result", "passed", "failed", "completed",
    ];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, `Invalid status: ${status}`);
    }
    if (status !== enrollment.status) {
      changes.status = { from: enrollment.status, to: status };
    }
    updates.status = status;
  }

  if (enrollmentMonth !== undefined) updates.enrollmentMonth = enrollmentMonth;
  if (enrollmentYear !== undefined) updates.enrollmentYear = enrollmentYear;
  if (enrollmentDate !== undefined) updates.enrollmentDate = enrollmentDate;
  if (learnerNumber !== undefined) updates.learnerNumber = learnerNumber?.trim() || null;
  if (ig1Date !== undefined) updates.ig1Date = ig1Date;
  if (ig2Date !== undefined) updates.ig2Date = ig2Date;
  if (interviewDate !== undefined) updates.interviewDate = interviewDate;
  if (resultDate !== undefined) updates.resultDate = resultDate;
  if (result !== undefined) {
    const validResults = ["pass", "fail", "pending", null];
    if (!validResults.includes(result)) {
      throw new ApiError(400, `Invalid result: ${result}`);
    }
    updates.result = result;
  }
  if (certificateSent !== undefined) updates.certificateSent = certificateSent;
  if (certificateSentDate !== undefined) updates.certificateSentDate = certificateSentDate;
  if (certificateSentVia !== undefined) updates.certificateSentVia = certificateSentVia;
  if (remarks !== undefined) updates.remarks = remarks?.trim() || null;

  // Allow changing institute if needed
  if (instituteId !== undefined) {
    const institute = await Institute.findOne({
      _id: instituteId,
      tenantId: req.tenantId,
      isDeleted: false,
    });
    if (!institute) throw new ApiError(404, "Institute not found");
    updates.instituteId = instituteId;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedEnrollment = await Enrollment.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  )
    .populate("candidateId", "fullName mobile email")
    .populate("courseId", "name shortCode")
    .populate("instituteId", "name");

  // ─────────────────────────────────────────
  // Recalculate avgResultDays if result was set
  // ─────────────────────────────────────────
  if (result && result !== "pending") {
    await recalculateAvgResultDays(
      updatedEnrollment.instituteId._id,
      updatedEnrollment.courseId._id
    );
  }

  // Build activity description
  let description = `${req.user.name} updated enrollment for ${updatedEnrollment.candidateId.fullName}`;
  if (changes.status) {
    description = `${req.user.name} changed enrollment status from ${changes.status.from} to ${changes.status.to} for ${updatedEnrollment.candidateId.fullName}`;
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_ENROLLMENT",
    entityType: "enrollment",
    entityId: updatedEnrollment._id,
    description,
    metadata: { updates: changes },
  });

  return res.status(200).json(
    new ApiResponse(200, updatedEnrollment, "Enrollment updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/enrollments/:id
// @access  Root, Admin, Staff
// @desc    Soft delete an enrollment
// ─────────────────────────────────────────
const deleteEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      },
    },
    { new: true }
  ).populate("candidateId", "fullName");

  if (!enrollment) {
    throw new ApiError(404, "Enrollment not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_ENROLLMENT",
    entityType: "enrollment",
    entityId: enrollment._id,
    description: `${req.user.name} deleted enrollment for ${enrollment.candidateId.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Enrollment deleted successfully")
  );
});

// ═════════════════════════════════════════
// CHECKLIST ENGINE
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// @route   PUT /api/enrollments/:id/checklist/:stepId/done
// @access  Root, Admin, Staff
// @desc    Mark a checklist step as done
//          Records timestamp and which user did it
//          Optional fields (date, assignedTo, note)
//          are saved if provided
// ─────────────────────────────────────────
const markStepDone = asyncHandler(async (req, res) => {
  const { id, stepId } = req.params;
  const { date, assignedTo, note } = req.body;

  const enrollment = await Enrollment.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!enrollment) throw new ApiError(404, "Enrollment not found");

  const step = enrollment.checklist.id(stepId);
  if (!step) throw new ApiError(404, "Checklist step not found");

  if (step.isDone) {
    throw new ApiError(400, "Step is already marked as done");
  }

  // Mark as done
  step.isDone = true;
  step.doneAt = new Date();
  step.doneBy = req.user._id;
  step.skipped = false;
  step.skipReason = null;

  // Save optional field values if provided
  if (date !== undefined) step.date = date;
  if (assignedTo !== undefined) step.assignedTo = assignedTo?.trim() || null;
  if (note !== undefined) step.note = note?.trim() || null;

  await enrollment.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CHECKLIST_STEP_DONE",
    entityType: "checklist",
    entityId: enrollment._id,
    description: `${req.user.name} marked step "${step.title}" as done`,
  });

  // Sort checklist before returning
  enrollment.checklist.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, enrollment, `Step "${step.title}" marked as done`)
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/enrollments/:id/checklist/:stepId/undone
// @access  Root, Admin, Staff
// @desc    Unmark a completed step
//          Clears doneAt, doneBy and optional fields
// ─────────────────────────────────────────
const markStepUndone = asyncHandler(async (req, res) => {
  const { id, stepId } = req.params;

  const enrollment = await Enrollment.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!enrollment) throw new ApiError(404, "Enrollment not found");

  const step = enrollment.checklist.id(stepId);
  if (!step) throw new ApiError(404, "Checklist step not found");

  if (!step.isDone && !step.skipped) {
    throw new ApiError(400, "Step is already unmarked");
  }

  // Reset step to initial state
  step.isDone = false;
  step.doneAt = null;
  step.doneBy = null;
  step.skipped = false;
  step.skipReason = null;

  await enrollment.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CHECKLIST_STEP_UNDONE",
    entityType: "checklist",
    entityId: enrollment._id,
    description: `${req.user.name} unmarked step "${step.title}"`,
  });

  enrollment.checklist.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, enrollment, `Step "${step.title}" unmarked`)
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/enrollments/:id/checklist/:stepId/skip
// @access  Root, Admin, Staff
// @desc    Skip a checklist step
//          Requires a skip reason
//          Cannot skip a required step
// ─────────────────────────────────────────
const skipStep = asyncHandler(async (req, res) => {
  const { id, stepId } = req.params;
  const { skipReason } = req.body;

  if (!skipReason || !skipReason.trim()) {
    throw new ApiError(400, "Skip reason is required");
  }

  const enrollment = await Enrollment.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!enrollment) throw new ApiError(404, "Enrollment not found");

  const step = enrollment.checklist.id(stepId);
  if (!step) throw new ApiError(404, "Checklist step not found");

  if (step.isRequired) {
    throw new ApiError(400, "Required steps cannot be skipped");
  }

  if (step.isDone) {
    throw new ApiError(400, "Cannot skip a step that is already done");
  }

  step.skipped = true;
  step.skipReason = skipReason.trim();
  step.isDone = false;
  step.doneAt = null;
  step.doneBy = null;

  await enrollment.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CHECKLIST_STEP_SKIPPED",
    entityType: "checklist",
    entityId: enrollment._id,
    description: `${req.user.name} skipped step "${step.title}" — reason: ${skipReason}`,
  });

  enrollment.checklist.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, enrollment, `Step "${step.title}" skipped`)
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/enrollments/:id/checklist/:stepId
// @access  Root, Admin, Staff
// @desc    Update optional field values on a step
//          (date, assignedTo, note) without
//          changing the done/skip state
// ─────────────────────────────────────────
const updateStepFields = asyncHandler(async (req, res) => {
  const { id, stepId } = req.params;
  const { date, assignedTo, note } = req.body;

  const enrollment = await Enrollment.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!enrollment) throw new ApiError(404, "Enrollment not found");

  const step = enrollment.checklist.id(stepId);
  if (!step) throw new ApiError(404, "Checklist step not found");

  if (date !== undefined) step.date = date;
  if (assignedTo !== undefined) step.assignedTo = assignedTo?.trim() || null;
  if (note !== undefined) step.note = note?.trim() || null;

  await enrollment.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CHECKLIST_STEP_UPDATED",
    entityType: "checklist",
    entityId: enrollment._id,
    description: `${req.user.name} updated fields for step "${step.title}"`,
  });

  enrollment.checklist.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, enrollment, `Step "${step.title}" updated`)
  );
});

export {
  createEnrollment,
  getEnrollments,
  getEnrollmentById,
  updateEnrollment,
  deleteEnrollment,
  markStepDone,
  markStepUndone,
  skipStep,
  updateStepFields,
};