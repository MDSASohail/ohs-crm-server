// models/User.model.js
// Represents a CRM user — someone who logs into the system.
// Each user belongs to one tenant and has one role.
// Roles control what they can see and do across the app.

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // ─────────────────────────────────────────
    // Tenant reference — every user belongs to
    // exactly one tenant (one business)
    // ─────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "Tenant ID is required"],
      index: true,
    },

    // ─────────────────────────────────────────
    // Identity
    // ─────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },

    // bcrypt hashed — never store plain text
    password: {
      type: String,
      required: [true, "Password is required"],
    },

    // ─────────────────────────────────────────
    // Role — controls access throughout the app
    // root   → full access including settings and deleted records
    // admin  → manage most things, no settings or user management
    // staff  → add/edit candidates, enrollments, payments
    // viewer → read-only access to everything
    // ─────────────────────────────────────────
    role: {
      type: String,
      enum: ["root", "admin", "staff", "viewer"],
      required: [true, "Role is required"],
    },

    // Whether this user can log in
    // Root can deactivate users without deleting them
    isActive: {
      type: Boolean,
      default: true,
    },

    // ─────────────────────────────────────────
    // Refresh token
    // Stored in DB so we can invalidate it on
    // logout or suspicious activity.
    // Only one active session per user for now.
    // ─────────────────────────────────────────
    refreshToken: {
      type: String,
      default: null,
    },

    // ─────────────────────────────────────────
    // Soft delete fields — required on every model
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
    timestamps: true,
  }
);

// ─────────────────────────────────────────
// Indexes
// Compound index on tenantId + email ensures
// email is unique per tenant — two different
// tenants can have the same email address,
// but within one tenant it must be unique.
// ─────────────────────────────────────────
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, isDeleted: 1 });
userSchema.index({ tenantId: 1, role: 1 });

// ─────────────────────────────────────────
// Never return password or refreshToken in
// any query response by default.
// Controllers can explicitly select them
// when needed (e.g. login, token refresh).
// ─────────────────────────────────────────
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.refreshToken;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;