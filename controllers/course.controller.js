// controllers/course.controller.js
// Handles all course management operations.
//
// Routes:
// POST   /api/courses          — create a course (root, admin)
// GET    /api/courses          — list all courses (all roles)
// GET    /api/courses/:id      — get single course (all roles)
// PUT    /api/courses/:id      — update course (root, admin)
// PUT    /api/courses/:id/deactivate — deactivate course (root, admin)
// PUT    /api/courses/:id/activate   — activate course (root, admin)
// DELETE /api/courses/:id      — soft delete course (root, admin)
//
// Design decisions:
// — shortCode must be unique per tenant (enforced at DB level too)
// — Deactivated courses cannot be used in new enrollments
//   but existing enrollments are never affected
// — Deleted courses are visible to root only

import Course from "../models/Course.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// @route   POST /api/courses
// @access  Root, Admin
// @desc    Create a new course
// ─────────────────────────────────────────
const createCourse = asyncHandler(async (req, res) => {
  const { name, shortCode, description } = req.body;

  // Validate required fields
  if (!name || !shortCode) {
    throw new ApiError(400, "Course name and short code are required");
  }

  // Check shortCode uniqueness within tenant
  const existing = await Course.findOne({
    tenantId: req.tenantId,
    shortCode: shortCode.toUpperCase().trim(),
    isDeleted: false,
  });

  if (existing) {
    throw new ApiError(
      409,
      `A course with short code ${shortCode.toUpperCase()} already exists`
    );
  }

  const course = await Course.create({
    tenantId: req.tenantId,
    name: name.trim(),
    shortCode: shortCode.toUpperCase().trim(),
    description: description ? description.trim() : null,
    isActive: true,
  });

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_COURSE",
    entityType: "course",
    entityId: course._id,
    description: `${req.user.name} created course ${course.name} (${course.shortCode})`,
  });

  return res.status(201).json(
    new ApiResponse(201, course, "Course created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/courses
// @access  All roles
// @desc    List all courses in the tenant
//          Supports optional query params:
//          ?active=true  — only active courses
//          ?active=false — only inactive courses
//          Root sees deleted courses too
// ─────────────────────────────────────────
const getCourses = asyncHandler(async (req, res) => {
  const { active } = req.query;

  // Build filter
  const filter = { tenantId: req.tenantId };

  // Non-root users never see deleted courses
  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  // Filter by active status if provided
  if (active !== undefined) {
    filter.isActive = active === "true";
  }

  const courses = await Course.find(filter).sort({
    isDeleted: 1,
    isActive: -1,
    name: 1,
  });
  // Sort order: active first, then inactive, then deleted
  // Within each group sorted alphabetically by name

  return res.status(200).json(
    new ApiResponse(200, courses, "Courses fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/courses/:id
// @access  All roles
// @desc    Get a single course by ID
// ─────────────────────────────────────────
const getCourseById = asyncHandler(async (req, res) => {
  const filter = {
    _id: req.params.id,
    tenantId: req.tenantId,
  };

  // Non-root users cannot see deleted courses
  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const course = await Course.findOne(filter);

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  return res.status(200).json(
    new ApiResponse(200, course, "Course fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/courses/:id
// @access  Root, Admin
// @desc    Update course name, shortCode, or description
// ─────────────────────────────────────────
const updateCourse = asyncHandler(async (req, res) => {
  const { name, shortCode, description } = req.body;

  const course = await Course.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ApiError(400, "Course name cannot be empty");
    }
    updates.name = name.trim();
  }

  if (shortCode !== undefined) {
    const normalizedCode = shortCode.toUpperCase().trim();

    // Check uniqueness — exclude current course
    const codeExists = await Course.findOne({
      tenantId: req.tenantId,
      shortCode: normalizedCode,
      isDeleted: false,
      _id: { $ne: req.params.id },
    });

    if (codeExists) {
      throw new ApiError(
        409,
        `Short code ${normalizedCode} is already in use`
      );
    }

    updates.shortCode = normalizedCode;
  }

  if (description !== undefined) {
    updates.description = description ? description.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedCourse = await Course.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_COURSE",
    entityType: "course",
    entityId: updatedCourse._id,
    description: `${req.user.name} updated course ${updatedCourse.name}`,
    metadata: { updates },
  });

  return res.status(200).json(
    new ApiResponse(200, updatedCourse, "Course updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/courses/:id/deactivate
// @access  Root, Admin
// @desc    Deactivate a course
//          Deactivated courses cannot be selected
//          for new enrollments but existing ones
//          are completely unaffected
// ─────────────────────────────────────────
const deactivateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    { $set: { isActive: false } },
    { new: true }
  );

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DEACTIVATE_COURSE",
    entityType: "course",
    entityId: course._id,
    description: `${req.user.name} deactivated course ${course.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, course, "Course deactivated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/courses/:id/activate
// @access  Root, Admin
// @desc    Reactivate a deactivated course
// ─────────────────────────────────────────
const activateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    { $set: { isActive: true } },
    { new: true }
  );

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ACTIVATE_COURSE",
    entityType: "course",
    entityId: course._id,
    description: `${req.user.name} activated course ${course.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, course, "Course activated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/courses/:id
// @access  Root, Admin
// @desc    Soft delete a course
//          Hidden from all users except root
//          Existing enrollments are unaffected
// ─────────────────────────────────────────
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
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
        isActive: false,
      },
    },
    { new: true }
  );

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_COURSE",
    entityType: "course",
    entityId: course._id,
    description: `${req.user.name} deleted course ${course.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Course deleted successfully")
  );
});

export {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deactivateCourse,
  activateCourse,
  deleteCourse,
};