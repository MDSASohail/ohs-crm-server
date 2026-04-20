// models/ActivityLog.model.js
// Records every meaningful action taken in the system.
// Append-only in practice — logs are never edited.
//
// Every significant controller action calls the
// activityLogger utility (built in Phase 3) which
// creates a document here automatically.
//
// Examples of logged actions:
// — "Created candidate Nahid Hussain"
// — "Marked IG-1 done for enrollment #123"
// — "Sent payment reminder to Wasi Ahmad"
// — "Changed enrollment status to Admitted"
// — "Uploaded document Passport Copy"
//
// Viewable by Root and Admin only.
// Soft delete is included for consistency
// but logs should never be deleted in practice.

import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
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
    // Who performed the action
    // ─────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },

    // ─────────────────────────────────────────
    // What was done
    // Short machine-readable action identifier
    // e.g. "CREATE_CANDIDATE", "UPDATE_ENROLLMENT_STATUS",
    // "MARK_CHECKLIST_STEP_DONE", "UPLOAD_DOCUMENT"
    // Used for filtering logs by action type
    // ─────────────────────────────────────────
    action: {
      type: String,
      required: [true, "Action is required"],
      trim: true,
      uppercase: true,
    },

    // ─────────────────────────────────────────
    // Which type of record was affected
    // ─────────────────────────────────────────
    entityType: {
      type: String,
      enum: [
        "candidate",
        "enrollment",
        "payment",
        "document",
        "reminder",
        "institute",
        "course",
        "user",
        "checklist",
        "tenant",
      ],
      required: [true, "Entity type is required"],
    },

    // The _id of the specific record that was affected
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ─────────────────────────────────────────
    // Human-readable description of the action
    // This is what is displayed in the activity
    // feed in the UI — written in plain English
    // e.g. "Created candidate Nahid Hussain"
    // e.g. "Marked step 'IG-1 Submission' as done"
    // ─────────────────────────────────────────
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    // ─────────────────────────────────────────
    // Optional snapshot of changed data
    // Stores before/after values for updates
    // Useful for detailed audit trail
    // e.g. { before: { status: "admitted" },
    //         after:  { status: "learning" } }
    // ─────────────────────────────────────────
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ─────────────────────────────────────────
    // Soft delete fields — required on every model
    // In practice these should never be used —
    // activity logs are permanent records.
    // Included for architectural consistency only.
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
    // Only createdAt matters for logs —
    // logs are never updated so updatedAt
    // is meaningless, but we include timestamps
    // for consistency across all models
    timestamps: true,
  }
);

// ─────────────────────────────────────────
// Indexes
// Activity logs are read-heavy in one direction —
// newest first, filtered by tenant, user, or entity
// ─────────────────────────────────────────

// All logs for a tenant — most common query
// sorted newest first
activityLogSchema.index({ tenantId: 1, createdAt: -1 });

// All actions by a specific user
activityLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

// All logs for a specific record
// e.g. full history of one candidate or enrollment
activityLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });

// Filter by action type
activityLogSchema.index({ tenantId: 1, action: 1 });

// Soft delete filter
activityLogSchema.index({ tenantId: 1, isDeleted: 1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;