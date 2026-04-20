// controllers/checklist.controller.js
// Manages checklist templates for courses.
//
// Routes:
// POST   /api/checklists/:courseId        — create template for a course
// GET    /api/checklists/:courseId        — get template for a course
// PUT    /api/checklists/:courseId        — replace all steps (full update)
// POST   /api/checklists/:courseId/steps  — add a single step
// PUT    /api/checklists/:courseId/steps/:stepId  — update a single step
// DELETE /api/checklists/:courseId/steps/:stepId  — remove a single step
// PUT    /api/checklists/:courseId/reorder — reorder steps
//
// Design decisions:
// — One template per course per tenant (enforced by unique index)
// — Template changes NEVER affect existing enrollments
//   Enrollments get a snapshot copy at creation time
// — Version is incremented on every update for audit trail
// — Steps are sorted by order field when returned
// — Only root and admin can manage templates

import ChecklistTemplate from "../models/ChecklistTemplate.model.js";
import Course from "../models/Course.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// Helper — verify course exists and belongs
// to this tenant before any template operation
// ─────────────────────────────────────────
const verifyCourse = async (courseId, tenantId) => {
  const course = await Course.findOne({
    _id: courseId,
    tenantId,
    isDeleted: false,
  });

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  return course;
};

// ─────────────────────────────────────────
// @route   POST /api/checklists/:courseId
// @access  Root, Admin
// @desc    Create a checklist template for a course
//          Fails if a template already exists —
//          use PUT to update an existing template
// ─────────────────────────────────────────
const createTemplate = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { steps = [] } = req.body;

  // Verify course exists in this tenant
  const course = await verifyCourse(courseId, req.tenantId);

  // Check if template already exists for this course
  const existing = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (existing) {
    throw new ApiError(
      409,
      "A checklist template already exists for this course — use PUT to update it"
    );
  }

  // Validate and normalize steps if provided
  const normalizedSteps = steps.map((step, index) => ({
    order: step.order ?? index + 1,
    title: step.title?.trim(),
    description: step.description?.trim() || null,
    hasDate: step.hasDate ?? false,
    hasAssignedTo: step.hasAssignedTo ?? false,
    hasNote: step.hasNote ?? false,
    isRequired: step.isRequired ?? false,
  }));

  // Validate all steps have titles
  const missingTitle = normalizedSteps.find((s) => !s.title);
  if (missingTitle) {
    throw new ApiError(400, "All steps must have a title");
  }

  const template = await ChecklistTemplate.create({
    tenantId: req.tenantId,
    courseId,
    steps: normalizedSteps,
    version: 1,
  });

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_CHECKLIST_TEMPLATE",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} created checklist template for course ${course.name}`,
  });

  return res.status(201).json(
    new ApiResponse(201, template, "Checklist template created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/checklists/:courseId
// @access  All roles
// @desc    Get the checklist template for a course
//          Steps are returned sorted by order field
// ─────────────────────────────────────────
const getTemplate = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  // Verify course exists in this tenant
  await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    throw new ApiError(
      404,
      "No checklist template found for this course"
    );
  }

  // Sort steps by order before returning
  template.steps.sort((a, b) => a.order - b.order);

  return res.status(200).json(
    new ApiResponse(200, template, "Checklist template fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   POST /api/checklists/:courseId/steps
// @access  Root, Admin
// @desc    Add a single step to the template
//          New step is appended at the end by default
//          unless an explicit order is provided
// ─────────────────────────────────────────
const addStep = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const {
    title,
    description,
    hasDate,
    hasAssignedTo,
    hasNote,
    isRequired,
    order,
  } = req.body;

  if (!title || !title.trim()) {
    throw new ApiError(400, "Step title is required");
  }

  // Verify course exists
  const course = await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    throw new ApiError(
      404,
      "No checklist template found for this course — create one first"
    );
  }

  // Determine order for new step
  // If no order provided, place at the end
  const maxOrder =
    template.steps.length > 0
      ? Math.max(...template.steps.map((s) => s.order))
      : 0;

  const newStep = {
    order: order ?? maxOrder + 1,
    title: title.trim(),
    description: description ? description.trim() : null,
    hasDate: hasDate ?? false,
    hasAssignedTo: hasAssignedTo ?? false,
    hasNote: hasNote ?? false,
    isRequired: isRequired ?? false,
  };

  template.steps.push(newStep);
  template.version += 1;
  await template.save();

  // Sort steps before returning
  template.steps.sort((a, b) => a.order - b.order);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ADD_CHECKLIST_STEP",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} added step "${newStep.title}" to checklist for course ${course.name}`,
  });

  return res.status(201).json(
    new ApiResponse(201, template, "Step added successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/checklists/:courseId/steps/:stepId
// @access  Root, Admin
// @desc    Update a single step in the template
// ─────────────────────────────────────────
const updateStep = asyncHandler(async (req, res) => {
  const { courseId, stepId } = req.params;
  const {
    title,
    description,
    hasDate,
    hasAssignedTo,
    hasNote,
    isRequired,
    order,
  } = req.body;

  // Verify course exists
  await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    throw new ApiError(404, "Checklist template not found");
  }

  // Find the specific step by its _id
  const step = template.steps.id(stepId);

  if (!step) {
    throw new ApiError(404, "Step not found");
  }

  // Apply updates to the step
  if (title !== undefined) {
    if (!title.trim()) {
      throw new ApiError(400, "Step title cannot be empty");
    }
    step.title = title.trim();
  }
  if (description !== undefined) step.description = description?.trim() || null;
  if (hasDate !== undefined) step.hasDate = hasDate;
  if (hasAssignedTo !== undefined) step.hasAssignedTo = hasAssignedTo;
  if (hasNote !== undefined) step.hasNote = hasNote;
  if (isRequired !== undefined) step.isRequired = isRequired;
  if (order !== undefined) step.order = order;

  template.version += 1;
  await template.save();

  // Sort steps before returning
  template.steps.sort((a, b) => a.order - b.order);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_CHECKLIST_STEP",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} updated step "${step.title}" in checklist`,
  });

  return res.status(200).json(
    new ApiResponse(200, template, "Step updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/checklists/:courseId/steps/:stepId
// @access  Root, Admin
// @desc    Remove a single step from the template
//          This does NOT affect existing enrollments
// ─────────────────────────────────────────
const deleteStep = asyncHandler(async (req, res) => {
  const { courseId, stepId } = req.params;

  // Verify course exists
  const course = await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    throw new ApiError(404, "Checklist template not found");
  }

  // Find step index
  const stepIndex = template.steps.findIndex(
    (s) => s._id.toString() === stepId
  );

  if (stepIndex === -1) {
    throw new ApiError(404, "Step not found");
  }

  const stepTitle = template.steps[stepIndex].title;

  // Remove the step
  template.steps.splice(stepIndex, 1);
  template.version += 1;
  await template.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_CHECKLIST_STEP",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} deleted step "${stepTitle}" from checklist for course ${course.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, template, "Step deleted successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/checklists/:courseId/reorder
// @access  Root, Admin
// @desc    Reorder steps by providing an array of
//          { stepId, order } objects
//          e.g. [{ stepId: "abc", order: 1 },
//                { stepId: "def", order: 2 }]
// ─────────────────────────────────────────
const reorderSteps = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { steps } = req.body;
  // steps = [{ stepId: "...", order: 1 }, ...]

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new ApiError(400, "Steps array is required for reordering");
  }

  // Verify course exists
  await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOne({
    tenantId: req.tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    throw new ApiError(404, "Checklist template not found");
  }

  // Apply new order values to each step
  steps.forEach(({ stepId, order }) => {
    const step = template.steps.id(stepId);
    if (step) {
      step.order = order;
    }
  });

  template.version += 1;
  await template.save();

  // Sort and return
  template.steps.sort((a, b) => a.order - b.order);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "REORDER_CHECKLIST_STEPS",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} reordered checklist steps`,
  });

  return res.status(200).json(
    new ApiResponse(200, template, "Steps reordered successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/checklists/:courseId
// @access  Root, Admin
// @desc    Soft delete the entire template
//          Existing enrollments are unaffected
// ─────────────────────────────────────────
const deleteTemplate = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await verifyCourse(courseId, req.tenantId);

  const template = await ChecklistTemplate.findOneAndUpdate(
    {
      tenantId: req.tenantId,
      courseId,
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
  );

  if (!template) {
    throw new ApiError(404, "Checklist template not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_CHECKLIST_TEMPLATE",
    entityType: "checklist",
    entityId: template._id,
    description: `${req.user.name} deleted checklist template for course ${course.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Checklist template deleted successfully")
  );
});

export {
  createTemplate,
  getTemplate,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  deleteTemplate,
};