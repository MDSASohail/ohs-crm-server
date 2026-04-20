// models/Course.model.js
// Represents an OHS certification course
// offered by the business — e.g. IGC, IOSH,
// OSHA, Diploma in Fire Safety, etc.
// Each course has its own checklist template
// and can be offered by multiple institutes.

import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    // ─────────────────────────────────────────
    // Tenant isolation
    // ─────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "Tenant ID is required"],
      index: true,
    },

    // ─────────────────────────────────────────
    // Course identity
    // ─────────────────────────────────────────

    // Full display name — e.g. "NEBOSH International
    // General Certificate in Occupational Health and Safety"
    name: {
      type: String,
      required: [true, "Course name is required"],
      trim: true,
    },

    // Short code used in badges, tables, and quick reference
    // e.g. "IGC", "IOSH", "OSHA", "DFS"
    shortCode: {
      type: String,
      required: [true, "Short code is required"],
      trim: true,
      uppercase: true,
    },

    // Optional longer description of the course
    description: {
      type: String,
      trim: true,
      default: null,
    },

    // Whether this course is currently active
    // Inactive courses cannot be used in new enrollments
    // but existing enrollments are never affected
    isActive: {
      type: Boolean,
      default: true,
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
// Compound unique index ensures shortCode is
// unique per tenant — two tenants can both
// have an "IGC" course, but within one tenant
// shortCodes must be unique.
// ─────────────────────────────────────────
courseSchema.index({ tenantId: 1, shortCode: 1 }, { unique: true });
courseSchema.index({ tenantId: 1, isDeleted: 1 });
courseSchema.index({ tenantId: 1, isActive: 1 });

const Course = mongoose.model("Course", courseSchema);

export default Course;