// models/Document.model.js
// Stores metadata for files uploaded under a candidate's profile.
// The actual file is stored on disk (local for now,
// Cloudinary or S3 later).
//
// Key design decisions:
// 1. Files are uploaded per candidate — not per enrollment
//    A document belongs to a person, not a specific course
// 2. fileUrl points to local /uploads path during development
//    When switching to Cloudinary, fileUrl becomes the CDN url
//    and cloudinaryPublicId is used for deletion
// 3. Soft delete applies — deleted files are hidden from UI
//    but the physical file is NOT deleted from disk/CDN
//    until a cleanup job runs (future feature)

import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
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
    // Candidate reference
    // Documents belong to a candidate, not
    // to a specific enrollment
    // ─────────────────────────────────────────
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: [true, "Candidate ID is required"],
    },

    // ─────────────────────────────────────────
    // File identity
    // ─────────────────────────────────────────

    // Custom display name given by the staff member
    // when uploading — e.g. "Passport Copy",
    // "Educational Certificate", "Experience Letter"
    name: {
      type: String,
      required: [true, "Document name is required"],
      trim: true,
    },

    // Full URL to access the file
    // Local dev: http://localhost:5000/uploads/filename.pdf
    // Cloudinary: https://res.cloudinary.com/...
    // S3: https://s3.amazonaws.com/...
    fileUrl: {
      type: String,
      required: [true, "File URL is required"],
      trim: true,
    },

    // MIME type of the uploaded file
    // e.g. "application/pdf", "image/jpeg",
    // "application/msword", "text/plain"
    fileType: {
      type: String,
      trim: true,
      default: null,
    },

    // File size in bytes
    // Used to enforce per-tenant size limits
    // and display human-readable size in UI
    fileSize: {
      type: Number,
      default: 0,
    },

    // ─────────────────────────────────────────
    // Storage provider metadata
    // Only relevant when using Cloudinary or S3
    // Kept null during local development
    // Required for deletion from CDN when switching
    // ─────────────────────────────────────────

    // Cloudinary public ID — needed to delete
    // the file from Cloudinary via the SDK
    cloudinaryPublicId: {
      type: String,
      trim: true,
      default: null,
    },

    // Which storage provider holds this file
    // Makes it easy to handle deletion logic
    // correctly when switching providers
    storageProvider: {
      type: String,
      enum: ["local", "cloudinary", "s3"],
      default: "local",
    },

    // Which staff member uploaded this file
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ─────────────────────────────────────────
    // Soft delete fields — required on every model
    // Note: soft deleting a document hides it
    // from the UI but does NOT delete the physical
    // file from disk or CDN — that requires a
    // separate cleanup step
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

// All documents for a candidate
documentSchema.index({ tenantId: 1, candidateId: 1 });

// Soft delete filter
documentSchema.index({ tenantId: 1, isDeleted: 1 });

// Storage provider — useful when running
// a migration or cleanup job across providers
documentSchema.index({ storageProvider: 1 });

const Document = mongoose.model("Document", documentSchema);

export default Document;