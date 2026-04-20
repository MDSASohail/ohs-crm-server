// controllers/tenant.controller.js
// Handles tenant profile operations.
//
// Routes:
// GET  /api/tenant        — get current tenant profile
// PUT  /api/tenant        — update tenant profile (root only)
//
// Design decisions:
// — There is no "create tenant" endpoint here.
//   Tenants are created via the seed script initially.
//   Later, a SaaS onboarding/signup flow will handle this.
// — A tenant can only see and edit their own profile.
//   tenantId is always taken from req.tenantId (set by
//   verifyJWT) — never from req.body or req.params.
//   This makes cross-tenant data access impossible.
// — Slug changes are not allowed after creation —
//   slug is used as a unique identifier and changing
//   it would break any references to it.

import Tenant from "../models/Tenant.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// @route   GET /api/tenant
// @access  Protected — all roles
// @desc    Get the current tenant's profile
// ─────────────────────────────────────────
const getTenant = asyncHandler(async (req, res) => {
  // tenantId is injected by verifyJWT middleware
  const tenant = await Tenant.findOne({
    _id: req.tenantId,
    isDeleted: false,
  });

  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  return res.status(200).json(
    new ApiResponse(200, tenant, "Tenant profile fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/tenant
// @access  Protected — root only
// @desc    Update the current tenant's profile
//          Only name and plan can be updated.
//          Slug is locked after creation.
// ─────────────────────────────────────────
const updateTenant = asyncHandler(async (req, res) => {
  // Only allow specific fields to be updated —
  // never trust the entire req.body
  const { name, plan } = req.body;

  // Build update object with only provided fields
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ApiError(400, "Tenant name cannot be empty");
    }
    updates.name = name.trim();
  }

  if (plan !== undefined) {
    const allowedPlans = ["free", "pro", "enterprise"];
    if (!allowedPlans.includes(plan)) {
      throw new ApiError(
        400,
        `Invalid plan — must be one of: ${allowedPlans.join(", ")}`
      );
    }
    updates.plan = plan;
  }

  // Nothing to update
  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  // Find and update — tenantId always from req, never from body
  const tenant = await Tenant.findOneAndUpdate(
    {
      _id: req.tenantId,
      isDeleted: false,
    },
    { $set: updates },
    {
      new: true,       // return updated document
      runValidators: true,
    }
  );

  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  // Log the activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_TENANT",
    entityType: "tenant",
    entityId: tenant._id,
    description: `${req.user.name} updated tenant profile`,
    metadata: { updates },
  });

  return res.status(200).json(
    new ApiResponse(200, tenant, "Tenant profile updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/tenant/deactivate
// @access  Protected — root only
// @desc    Deactivate the tenant account
//          This is a soft disable — not a delete.
//          A deactivated tenant cannot log in.
//          Only a super-admin (platform level)
//          can reactivate — not built yet.
// ─────────────────────────────────────────
const deactivateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOneAndUpdate(
    {
      _id: req.tenantId,
      isDeleted: false,
    },
    { $set: { isActive: false } },
    { new: true }
  );

  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  // Log the activity
  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DEACTIVATE_TENANT",
    entityType: "tenant",
    entityId: tenant._id,
    description: `${req.user.name} deactivated tenant account`,
  });

  return res.status(200).json(
    new ApiResponse(200, tenant, "Tenant account deactivated successfully")
  );
});

export { getTenant, updateTenant, deactivateTenant };