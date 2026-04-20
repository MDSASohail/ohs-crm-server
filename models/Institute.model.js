// models/Institute.model.js
// Represents an institute that delivers OHS courses.
// Each institute can have multiple contact persons
// and offer multiple courses at different fees.
// avgResultDays per course is auto-calculated from
// past enrollment data and updated periodically.

import mongoose from "mongoose";

// ─────────────────────────────────────────
// Sub-schema for a contact person at the institute
// Multiple contacts can be stored per institute
// e.g. coordinator, accounts, director
// ─────────────────────────────────────────
const contactPersonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Contact name is required"],
      trim: true,
    },

    mobile: {
      type: String,
      trim: true,
      default: null,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    // Role of this person at the institute
    // e.g. "Coordinator", "Accounts", "Director"
    role: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────
// Sub-schema for a course offered by the institute
// Each entry links a course to a fee and tracks
// average result delivery days for that course
// at this specific institute
// ─────────────────────────────────────────
const courseOfferedSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course ID is required"],
    },

    // Fee charged by this institute for this course
    // in the local currency
    fee: {
      type: Number,
      default: 0,
    },

    // Optional notes about this course at this institute
    // e.g. "Fee includes study materials"
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Average number of days from enrollment to result
    // for this course at this institute.
    // Calculated automatically from completed enrollments
    // — not entered manually by staff.
    avgResultDays: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────
// Main institute schema
// ─────────────────────────────────────────
const instituteSchema = new mongoose.Schema(
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
    // Institute identity
    // ─────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Institute name is required"],
      trim: true,
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    mobile: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Contact persons at this institute
    // Array of people staff can reach out to
    // ─────────────────────────────────────────
    contacts: {
      type: [contactPersonSchema],
      default: [],
    },

    // ─────────────────────────────────────────
    // Courses this institute offers
    // Each entry includes the course, fee, and
    // calculated average result delivery days
    // ─────────────────────────────────────────
    coursesOffered: {
      type: [courseOfferedSchema],
      default: [],
    },

    // General notes about this institute
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Whether this institute is currently active
    // Inactive institutes cannot be selected for
    // new enrollments but existing ones are unaffected
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
// ─────────────────────────────────────────
instituteSchema.index({ tenantId: 1, name: 1 });
instituteSchema.index({ tenantId: 1, isDeleted: 1 });
instituteSchema.index({ tenantId: 1, isActive: 1 });

// Text index for searching institutes by name
instituteSchema.index(
  { name: "text" },
  { name: "institute_text_search" }
);

const Institute = mongoose.model("Institute", instituteSchema);

export default Institute;