// models/Reminder.model.js
// Stores reminders sent or scheduled for candidates.
//
// Three delivery types:
// 1. internal  — shown as an on-screen notification in the CRM
// 2. email     — sent via Nodemailer (Gmail SMTP)
// 3. whatsapp  — sent via WhatsApp Cloud API (Meta)
//
// Reminders can be:
// — sent immediately (sentAt is set right away)
// — scheduled for future delivery (scheduledAt is set,
//   a background job picks it up and sends it)
//
// Full history is kept — no reminder is ever hard deleted.
// Status tracks the lifecycle: pending → sent / failed / cancelled

import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
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
    // References
    // candidateId is always required —
    //   reminders always belong to a candidate
    // enrollmentId is optional —
    //   a reminder may be about a specific enrollment
    //   or just about the candidate in general
    // ─────────────────────────────────────────
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: [true, "Candidate ID is required"],
    },

    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      default: null,
    },

    // ─────────────────────────────────────────
    // Delivery channel
    // ─────────────────────────────────────────
    type: {
      type: String,
      enum: ["internal", "email", "whatsapp"],
      required: [true, "Reminder type is required"],
    },

    // ─────────────────────────────────────────
    // Content
    // subject is used for email type reminders
    // message is the body for all types
    // ─────────────────────────────────────────
    subject: {
      type: String,
      trim: true,
      default: null,
    },

    message: {
      type: String,
      required: [true, "Reminder message is required"],
      trim: true,
    },

    // ─────────────────────────────────────────
    // Scheduling
    // scheduledAt — when this reminder should
    //   be sent (can be now or future)
    // sentAt — when it was actually sent
    //   null until delivery is confirmed
    // ─────────────────────────────────────────
    scheduledAt: {
      type: Date,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    // ─────────────────────────────────────────
    // Delivery status lifecycle:
    // pending   — created, not yet sent
    // sent      — successfully delivered
    // failed    — delivery attempted but failed
    // cancelled — manually cancelled before sending
    // ─────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "cancelled"],
      default: "pending",
    },

    // If delivery failed, store the error message
    // for debugging and display in the UI
    failureReason: {
      type: String,
      trim: true,
      default: null,
    },

    // Which staff member created this reminder
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
// ─────────────────────────────────────────

// All reminders for a candidate
reminderSchema.index({ tenantId: 1, candidateId: 1 });

// All reminders for an enrollment
reminderSchema.index({ tenantId: 1, enrollmentId: 1 });

// Pending reminders — polled by the background
// job that sends scheduled reminders
reminderSchema.index({ tenantId: 1, status: 1 });

// Scheduled reminders due for sending —
// background job queries by scheduledAt <= now
// and status === "pending"
reminderSchema.index({ status: 1, scheduledAt: 1 });

// Soft delete filter
reminderSchema.index({ tenantId: 1, isDeleted: 1 });

// Filter by delivery type
reminderSchema.index({ tenantId: 1, type: 1 });

const Reminder = mongoose.model("Reminder", reminderSchema);

export default Reminder;