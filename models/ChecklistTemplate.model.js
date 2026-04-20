// models/ChecklistTemplate.model.js
// Stores the checklist template for a course.
// Each course has one active template containing
// an ordered list of steps.
//
// IMPORTANT: When a new enrollment is created,
// the current template steps are COPIED into the
// enrollment document. After that, the enrollment's
// checklist is fully independent — editing this
// template never touches existing enrollments.
//
// Version is incremented every time the template
// is updated — useful for audit and future diffing.

import mongoose from "mongoose";

// ─────────────────────────────────────────
// Sub-schema for a single checklist step
// Defined separately for clarity and reuse —
// the same shape is used in Enrollment.model.js
// ─────────────────────────────────────────
const checklistStepSchema = new mongoose.Schema(
  {
    // Display order of this step in the checklist
    // Steps are sorted by this field when rendered
    order: {
      type: Number,
      required: [true, "Step order is required"],
    },

    // Short label shown in the checklist UI
    title: {
      type: String,
      required: [true, "Step title is required"],
      trim: true,
    },

    // Optional longer explanation of what this step involves
    description: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Optional extra fields — when true, the
    // corresponding input is shown inline when
    // a staff member fills in this step on an
    // enrollment checklist
    // ─────────────────────────────────────────

    // Show a date picker for this step
    // e.g. "IG-1 Submission Date"
    hasDate: {
      type: Boolean,
      default: false,
    },

    // Show an "Assigned To" text field
    // e.g. assign this step to a specific staff member
    hasAssignedTo: {
      type: Boolean,
      default: false,
    },

    // Show a free-text note field for this step
    hasNote: {
      type: Boolean,
      default: false,
    },

    // If true, this step cannot be skipped —
    // enrollment cannot move forward without it
    isRequired: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Each step gets its own _id automatically
    // This _id is used to reference the step
    // when copying into enrollments
    _id: true,
  }
);

// ─────────────────────────────────────────
// Main checklist template schema
// ─────────────────────────────────────────
const checklistTemplateSchema = new mongoose.Schema(
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

    // The course this template belongs to
    // One template per course per tenant
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course ID is required"],
    },

    // Ordered list of steps in this template
    steps: {
      type: [checklistStepSchema],
      default: [],
    },

    // Incremented every time the template is saved
    // Helps track how many times a template has
    // been revised over the lifetime of the course
    version: {
      type: Number,
      default: 1,
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
    // Only updatedAt is meaningful here —
    // createdAt is less important for templates
    // but we include both for consistency
    timestamps: true,
  }
);

// ─────────────────────────────────────────
// Indexes
// Compound unique index ensures only one
// active template exists per course per tenant
// ─────────────────────────────────────────
checklistTemplateSchema.index(
  { tenantId: 1, courseId: 1 },
  { unique: true }
);
checklistTemplateSchema.index({ tenantId: 1, isDeleted: 1 });

const ChecklistTemplate = mongoose.model(
  "ChecklistTemplate",
  checklistTemplateSchema
);

export default ChecklistTemplate;