// models/Enrollment.model.js
// Links a candidate to a course and institute.
// Tracks the full journey from enquiry to certificate delivery.
//
// Key design decisions:
// 1. checklist is COPIED from the course template at creation time
//    — template changes never affect existing enrollments
// 2. Each checklist step is fully self-contained inside the enrollment
//    — no reference back to the template needed at runtime
// 3. Status pipeline is strictly defined — UI enforces valid transitions
//    but the model itself does not — keeping flexibility for edge cases

import mongoose from "mongoose";

// ─────────────────────────────────────────
// Sub-schema for a single checklist step
// stored inside an enrollment.
// This is a snapshot of the template step
// at the time the enrollment was created,
// plus fields to track completion state.
// ─────────────────────────────────────────
const enrollmentChecklistStepSchema = new mongoose.Schema(
  {
    // Reference to the original step _id in the template
    // Stored for traceability — not used in queries
    stepId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Copied from template at enrollment creation time
    title: {
      type: String,
      required: true,
      trim: true,
    },

    order: {
      type: Number,
      required: true,
    },

    isRequired: {
      type: Boolean,
      default: false,
    },

    // Which optional fields are shown for this step
    hasDate: {
      type: Boolean,
      default: false,
    },

    hasAssignedTo: {
      type: Boolean,
      default: false,
    },

    hasNote: {
      type: Boolean,
      default: false,
    },

    // ─────────────────────────────────────────
    // Completion state — updated by staff
    // ─────────────────────────────────────────

    isDone: {
      type: Boolean,
      default: false,
    },

    // Timestamp of when this step was marked done
    doneAt: {
      type: Date,
      default: null,
    },

    // Which user marked this step as done
    doneBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Whether this step was skipped instead of completed
    skipped: {
      type: Boolean,
      default: false,
    },

    // Required when skipped — explains why
    skipReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Optional field values — only relevant
    // when the corresponding has* flag is true
    // ─────────────────────────────────────────

    // Shown when hasDate is true
    date: {
      type: Date,
      default: null,
    },

    // Shown when hasAssignedTo is true
    assignedTo: {
      type: String,
      trim: true,
      default: null,
    },

    // Shown when hasNote is true
    note: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────
// Main enrollment schema
// ─────────────────────────────────────────
const enrollmentSchema = new mongoose.Schema(
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
    // Core references
    // ─────────────────────────────────────────
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: [true, "Candidate ID is required"],
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course ID is required"],
    },

    instituteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institute",
      required: [true, "Institute ID is required"],
    },

    // ─────────────────────────────────────────
    // Enrollment timing
    // Month and year stored separately for easy
    // filtering by month/year without date parsing
    // ─────────────────────────────────────────
    enrollmentMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },

    enrollmentYear: {
      type: Number,
      default: null,
    },

    // Full date if known — optional
    enrollmentDate: {
      type: Date,
      default: null,
    },

    // ─────────────────────────────────────────
    // Status pipeline
    // Valid transitions enforced by the UI/controller
    // The model accepts any valid enum value
    // to allow flexibility in edge cases
    //
    // Pipeline order:
    // enquiry → documents_pending → admitted →
    // learning → exam → awaiting_result →
    // passed / failed → completed
    // ─────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "enquiry",
        "documents_pending",
        "admitted",
        "learning",
        "exam",
        "awaiting_result",
        "passed",
        "failed",
        "completed",
      ],
      default: "enquiry",
    },

    // ─────────────────────────────────────────
    // Exam and result tracking
    // ─────────────────────────────────────────

    // Candidate's unique learner number assigned
    // by the institute or exam board
    learnerNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // IG-1 and IG-2 are the two assessment units
    // for NEBOSH IGC — stored as dates of submission
    ig1Date: {
      type: Date,
      default: null,
    },

    ig2Date: {
      type: Date,
      default: null,
    },

    // Date of viva/interview if applicable
    interviewDate: {
      type: Date,
      default: null,
    },

    // Date the result was received
    resultDate: {
      type: Date,
      default: null,
    },

    // Final result of the exam
    result: {
      type: String,
      enum: ["pass", "fail", "pending", null],
      default: null,
    },

    // ─────────────────────────────────────────
    // Certificate delivery tracking
    // ─────────────────────────────────────────
    certificateSent: {
      type: Boolean,
      default: false,
    },

    certificateSentDate: {
      type: Date,
      default: null,
    },

    certificateSentVia: {
      type: String,
      enum: ["courier", "email", "hand", null],
      default: null,
    },

    // ─────────────────────────────────────────
    // Checklist
    // Copied from the course's checklist template
    // when this enrollment is created.
    // Fully independent after that point.
    // ─────────────────────────────────────────
    checklist: {
      type: [enrollmentChecklistStepSchema],
      default: [],
    },

    // General remarks about this enrollment
    remarks: {
      type: String,
      trim: true,
      default: null,
    },

    // Which staff member created this enrollment
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
// Designed for the most common query patterns:
// — list enrollments for a candidate
// — filter by course, institute, status
// — filter by month and year
// — filter by result and payment status
// ─────────────────────────────────────────

// Most common — all enrollments for a tenant
enrollmentSchema.index({ tenantId: 1, isDeleted: 1 });

// Candidate enrollment history
enrollmentSchema.index({ tenantId: 1, candidateId: 1 });

// Filter by course
enrollmentSchema.index({ tenantId: 1, courseId: 1 });

// Filter by institute
enrollmentSchema.index({ tenantId: 1, instituteId: 1 });

// Filter by status
enrollmentSchema.index({ tenantId: 1, status: 1 });

// Filter by month and year — used in dashboard and reports
enrollmentSchema.index({ tenantId: 1, enrollmentYear: 1, enrollmentMonth: 1 });

// Filter by result
enrollmentSchema.index({ tenantId: 1, result: 1 });

// Upcoming exam and result dates — used in dashboard
enrollmentSchema.index({ tenantId: 1, ig1Date: 1 });
enrollmentSchema.index({ tenantId: 1, ig2Date: 1 });
enrollmentSchema.index({ tenantId: 1, resultDate: 1 });

const Enrollment = mongoose.model("Enrollment", enrollmentSchema);

export default Enrollment;