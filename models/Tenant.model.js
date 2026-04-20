// models/Tenant.model.js
// Represents a business (tenant) using the SaaS platform.
// Every other collection references tenantId from this model.
// One tenant = one completely isolated workspace.

import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    // ─────────────────────────────────────────
    // Core fields
    // ─────────────────────────────────────────

    // Display name of the business
    name: {
      type: String,
      required: [true, "Tenant name is required"],
      trim: true,
    },

    // URL-safe unique identifier for the tenant
    // e.g. "my-ohs-business"
    // Used in subdomain routing or tenant lookup
    slug: {
      type: String,
      required: [true, "Tenant slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Subscription plan — Stripe integration comes later
    // For now everything is "free"
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },

    // Whether this tenant's account is active
    // Root can deactivate a tenant without deleting it
    isActive: {
      type: Boolean,
      default: true,
    },

    // ─────────────────────────────────────────
    // Soft delete fields — required on every model
    // Never hard delete — only set isDeleted: true
    // ─────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    // Automatically adds createdAt and updatedAt fields
    timestamps: true,
  }
);

// ─────────────────────────────────────────
// Indexes
// slug is already indexed via unique: true
// isDeleted index speeds up the standard
// { isDeleted: false } filter on every query
// ─────────────────────────────────────────
tenantSchema.index({ isDeleted: 1 });
tenantSchema.index({ isActive: 1 });

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;