// controllers/user.controller.js
// Handles all user management operations.
// Only Root can access these endpoints.
//
// Routes:
// POST   /api/users              — create a new user
// GET    /api/users              — list all users in tenant
// GET    /api/users/:id          — get a single user
// PUT    /api/users/:id          — update user details
// PUT    /api/users/:id/deactivate  — deactivate a user
// PUT    /api/users/:id/activate    — reactivate a user
// DELETE /api/users/:id          — soft delete a user
//
// Design decisions:
// — Root cannot delete or deactivate themselves
// — Root cannot change their own role
// — Email must be unique within a tenant
// — Password is hashed with bcrypt before storing
// — Deleted users are hidden from all listings
//   unless the requesting user is Root

import bcrypt from "bcrypt";
import User from "../models/User.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// @route   POST /api/users
// @access  Root only
// @desc    Create a new user within the tenant
// ─────────────────────────────────────────
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Validate required fields
  if (!name || !email || !password || !role) {
    throw new ApiError(400, "Name, email, password and role are required");
  }

  // Validate role
  const allowedRoles = ["admin", "staff", "viewer"];
  if (!allowedRoles.includes(role)) {
    throw new ApiError(
      400,
      `Invalid role — must be one of: ${allowedRoles.join(", ")}`
    );
  }
  // Root cannot create another root user —
  // there is only one root per tenant (the seed user)

  // Validate password length
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  // Check if email already exists within this tenant
  const existingUser = await User.findOne({
    tenantId: req.tenantId,
    email: email.toLowerCase().trim(),
    isDeleted: false,
  });

  if (existingUser) {
    throw new ApiError(409, "A user with this email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await User.create({
    tenantId: req.tenantId,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashedPassword,
    role,
    isActive: true,
  });

  // Log activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_USER",
    entityType: "user",
    entityId: user._id,
    description: `${req.user.name} created user ${user.name} with role ${user.role}`,
  });

  // toJSON transform strips password and refreshToken
  return res.status(201).json(
    new ApiResponse(201, user, "User created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/users
// @access  Root only
// @desc    List all users in the current tenant
//          Root sees all users including deleted ones
//          (deleted ones are flagged with isDeleted: true)
// ─────────────────────────────────────────
const getUsers = asyncHandler(async (req, res) => {
  // Root can see deleted users — all others cannot.
  // Since this route is root-only, we always show
  // all users including soft deleted ones, but we
  // sort active ones first for better UX.
  const users = await User.find({
    tenantId: req.tenantId,
  })
    .select("-password -refreshToken")
    .sort({ isDeleted: 1, createdAt: -1 });
  // isDeleted: 1 sorts false (active) before true (deleted)

  return res.status(200).json(
    new ApiResponse(200, users, "Users fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/users/:id
// @access  Root only
// @desc    Get a single user by ID
// ─────────────────────────────────────────
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    // Root can view deleted users too
  }).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, user, "User fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/users/:id
// @access  Root only
// @desc    Update user name, email, or role
//          Root cannot change their own role
// ─────────────────────────────────────────
const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;

  // Find user — must belong to this tenant
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Root cannot change their own role —
  // prevents accidentally locking themselves out
  if (
    user._id.toString() === req.user._id.toString() &&
    role !== undefined &&
    role !== user.role
  ) {
    throw new ApiError(403, "You cannot change your own role");
  }

  // Build updates object
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ApiError(400, "Name cannot be empty");
    }
    updates.name = name.trim();
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if new email is already taken by another user
    // in this tenant
    const emailExists = await User.findOne({
      tenantId: req.tenantId,
      email: normalizedEmail,
      isDeleted: false,
      _id: { $ne: req.params.id }, // exclude current user
    });

    if (emailExists) {
      throw new ApiError(409, "This email is already in use");
    }

    updates.email = normalizedEmail;
  }

  if (role !== undefined) {
    const allowedRoles = ["admin", "staff", "viewer"];
    if (!allowedRoles.includes(role)) {
      throw new ApiError(
        400,
        `Invalid role — must be one of: ${allowedRoles.join(", ")}`
      );
    }
    updates.role = role;
  }

  // Allow password reset by root
  if (password !== undefined) {
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters");
    }
    updates.password = await bcrypt.hash(password, 12);
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  // Log activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_USER",
    entityType: "user",
    entityId: updatedUser._id,
    description: `${req.user.name} updated user ${updatedUser.name}`,
    metadata: { updates: { ...updates, password: undefined } },
  });

  return res.status(200).json(
    new ApiResponse(200, updatedUser, "User updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/users/:id/deactivate
// @access  Root only
// @desc    Deactivate a user — they cannot log in
//          but their data and history are preserved
//          Root cannot deactivate themselves
// ─────────────────────────────────────────
const deactivateUser = asyncHandler(async (req, res) => {
  // Root cannot deactivate themselves
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(403, "You cannot deactivate your own account");
  }

  const user = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    { $set: { isActive: false } },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Log activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DEACTIVATE_USER",
    entityType: "user",
    entityId: user._id,
    description: `${req.user.name} deactivated user ${user.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, user, "User deactivated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/users/:id/activate
// @access  Root only
// @desc    Reactivate a previously deactivated user
// ─────────────────────────────────────────
const activateUser = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    { $set: { isActive: true } },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Log activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ACTIVATE_USER",
    entityType: "user",
    entityId: user._id,
    description: `${req.user.name} activated user ${user.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, user, "User activated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/users/:id
// @access  Root only
// @desc    Soft delete a user
//          Sets isDeleted: true, deletedAt, deletedBy
//          Root cannot delete themselves
//          Deleted users cannot log in and are hidden
//          from all listings except root view
// ─────────────────────────────────────────
const deleteUser = asyncHandler(async (req, res) => {
  // Root cannot delete themselves
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(403, "You cannot delete your own account");
  }

  const user = await User.findOneAndUpdate(
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
        // Invalidate refresh token on delete —
        // forces immediate logout if they are
        // currently logged in
        refreshToken: null,
        isActive: false,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Log activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_USER",
    entityType: "user",
    entityId: user._id,
    description: `${req.user.name} deleted user ${user.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "User deleted successfully")
  );
});

export {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
};