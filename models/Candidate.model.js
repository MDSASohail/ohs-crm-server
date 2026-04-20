// models/Candidate.model.js
// Represents a person who contacts the business
// for OHS course guidance and enrollment.
// One candidate can have many enrollments over time.
// All personal, family, contact, and credential
// information is stored here.

import mongoose from "mongoose";

const candidateSchema = new mongoose.Schema(
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
    // Personal information
    // ─────────────────────────────────────────

    // Full legal name used for all official purposes
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    // Name exactly as it should appear on the certificate
    // May differ from fullName (e.g. no middle name)
    nameOnCertificate: {
      type: String,
      trim: true,
      default: null,
    },

    dob: {
      type: Date,
      default: null,
    },

    // ─────────────────────────────────────────
    // Contact information
    // ─────────────────────────────────────────
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

    alternativeMobile: {
      type: String,
      trim: true,
      default: null,
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Professional background
    // ─────────────────────────────────────────
    qualification: {
      type: String,
      trim: true,
      default: null,
    },

    currentCompany: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Family information
    // ─────────────────────────────────────────
    fatherName: {
      type: String,
      trim: true,
      default: null,
    },

    fatherMobile: {
      type: String,
      trim: true,
      default: null,
    },

    fatherOccupation: {
      type: String,
      trim: true,
      default: null,
    },

    motherName: {
      type: String,
      trim: true,
      default: null,
    },

    motherMobile: {
      type: String,
      trim: true,
      default: null,
    },

    // ─────────────────────────────────────────
    // Institute portal credentials
    // Stored so staff can log in on behalf of
    // the candidate when needed.
    // Note: stored as plain text by design —
    // these are the candidate's own credentials
    // for third-party portals, not our system.
    // ─────────────────────────────────────────
    emailCredential: {
      email: {
        type: String,
        trim: true,
        default: null,
      },
      password: {
        type: String,
        trim: true,
        default: null,
      },
    },

    // ─────────────────────────────────────────
    // How this candidate found or was referred
    // to the business — useful for marketing
    // and referral tracking
    // ─────────────────────────────────────────
    referredBy: {
      type: String,
      trim: true,
      default: null,
    },

    // General notes about the candidate
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Which staff member created this candidate record
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
// Compound indexes on the fields most commonly
// used for search and filtering within a tenant.
// ─────────────────────────────────────────

// Primary search fields
candidateSchema.index({ tenantId: 1, fullName: 1 });
candidateSchema.index({ tenantId: 1, mobile: 1 });
candidateSchema.index({ tenantId: 1, email: 1 });

// Soft delete filter — used on almost every query
candidateSchema.index({ tenantId: 1, isDeleted: 1 });

// Referral source filter
candidateSchema.index({ tenantId: 1, referredBy: 1 });

// Text index for global search across name, email, mobile
candidateSchema.index(
  {
    fullName: "text",
    email: "text",
    mobile: "text",
    currentCompany: "text",
  },
  {
    // Weights give fullName matches higher priority
    // in text search results
    weights: {
      fullName: 10,
      mobile: 8,
      email: 5,
      currentCompany: 3,
    },
    name: "candidate_text_search",
  }
);

const Candidate = mongoose.model("Candidate", candidateSchema);

export default Candidate;