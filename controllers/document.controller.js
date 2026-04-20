// controllers/document.controller.js
// Handles file uploads and document management
// for candidate profiles.
//
// Routes:
// POST   /api/documents/:candidateId        — upload a file (root, admin, staff)
// GET    /api/documents/:candidateId        — list documents for a candidate (all roles)
// GET    /api/documents/:candidateId/:docId — get single document (all roles)
// DELETE /api/documents/:candidateId/:docId — soft delete document (root, admin, staff)
//
// Design decisions:
// — Documents belong to a candidate, not an enrollment
// — Files are stored locally during development
//   fileUrl points to http://localhost:5000/uploads/filename
// — Soft delete hides the document from UI but does
//   NOT delete the physical file from disk
//   A future cleanup job will handle physical deletion
// — Root sees deleted documents, others do not
// — storageProvider field makes future migration easy

import path from "path";
import fs from "fs";
import Document from "../models/Document.model.js";
import Candidate from "../models/Candidate.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";
import { UPLOAD_DEST } from "../config/env.js";

// ─────────────────────────────────────────
// Helper — build the public URL for a locally
// stored file so the frontend can display it
// When switching to Cloudinary/S3, this helper
// is replaced — nothing else changes
// ─────────────────────────────────────────
const buildFileUrl = (req, filename) => {
  return `${req.protocol}://${req.get("host")}/uploads/${filename}`;
};

// ─────────────────────────────────────────
// Helper — verify candidate exists and belongs
// to this tenant before any document operation
// ─────────────────────────────────────────
const verifyCandidate = async (candidateId, tenantId) => {
  const candidate = await Candidate.findOne({
    _id: candidateId,
    tenantId,
    isDeleted: false,
  });

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  return candidate;
};

// ─────────────────────────────────────────
// @route   POST /api/documents/:candidateId
// @access  Root, Admin, Staff
// @desc    Upload a file under a candidate profile
//          Expects multipart/form-data with:
//          — file: the file to upload
//          — name: custom display name for the document
// ─────────────────────────────────────────
const uploadDocument = asyncHandler(async (req, res) => {
  const { candidateId } = req.params;
  const { name } = req.body;

  // Verify candidate exists in this tenant
  const candidate = await verifyCandidate(candidateId, req.tenantId);

  // req.file is set by Multer after successful upload
  if (!req.file) {
    throw new ApiError(400, "No file uploaded — include a file in the request");
  }

  if (!name || !name.trim()) {
    // If no name provided, use the original filename
    // without extension as the display name
    const defaultName = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname)
    );
    req.body.name = defaultName;
  }

  // Build the public URL for this file
  const fileUrl = buildFileUrl(req, req.file.filename);

  // Create document record in DB
  const document = await Document.create({
    tenantId: req.tenantId,
    candidateId,
    name: (name || req.body.name).trim(),
    fileUrl,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    // cloudinaryPublicId is null for local storage
    cloudinaryPublicId: null,
    storageProvider: "local",
    uploadedBy: req.user._id,
  });

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPLOAD_DOCUMENT",
    entityType: "document",
    entityId: document._id,
    description: `${req.user.name} uploaded document "${document.name}" for candidate ${candidate.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(201, document, "Document uploaded successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/documents/:candidateId
// @access  All roles
// @desc    List all documents for a candidate
//          Root sees deleted documents too
//          Deleted documents shown with isDeleted flag
// ─────────────────────────────────────────
const getDocuments = asyncHandler(async (req, res) => {
  const { candidateId } = req.params;

  // Verify candidate exists in this tenant
  await verifyCandidate(candidateId, req.tenantId);

  const filter = {
    tenantId: req.tenantId,
    candidateId,
  };

  // Non-root users never see deleted documents
  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const documents = await Document.find(filter)
    .populate("uploadedBy", "name email")
    .populate("deletedBy", "name email")
    .sort({ isDeleted: 1, createdAt: -1 });
  // Active documents first, then deleted ones (root only)

  return res.status(200).json(
    new ApiResponse(200, documents, "Documents fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/documents/:candidateId/:docId
// @access  All roles
// @desc    Get a single document record by ID
// ─────────────────────────────────────────
const getDocumentById = asyncHandler(async (req, res) => {
  const { candidateId, docId } = req.params;

  // Verify candidate exists in this tenant
  await verifyCandidate(candidateId, req.tenantId);

  const filter = {
    _id: docId,
    tenantId: req.tenantId,
    candidateId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const document = await Document.findOne(filter)
    .populate("uploadedBy", "name email")
    .populate("deletedBy", "name email");

  if (!document) {
    throw new ApiError(404, "Document not found");
  }

  return res.status(200).json(
    new ApiResponse(200, document, "Document fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/documents/:candidateId/:docId
// @access  Root, Admin, Staff
// @desc    Update document display name only
//          File itself cannot be replaced —
//          delete and re-upload instead
// ─────────────────────────────────────────
const updateDocument = asyncHandler(async (req, res) => {
  const { candidateId, docId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Document name is required");
  }

  // Verify candidate exists in this tenant
  await verifyCandidate(candidateId, req.tenantId);

  const document = await Document.findOneAndUpdate(
    {
      _id: docId,
      tenantId: req.tenantId,
      candidateId,
      isDeleted: false,
    },
    { $set: { name: name.trim() } },
    { new: true }
  )
    .populate("uploadedBy", "name email");

  if (!document) {
    throw new ApiError(404, "Document not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_DOCUMENT",
    entityType: "document",
    entityId: document._id,
    description: `${req.user.name} renamed document to "${document.name}"`,
  });

  return res.status(200).json(
    new ApiResponse(200, document, "Document updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/documents/:candidateId/:docId
// @access  Root, Admin, Staff
// @desc    Soft delete a document
//          Sets isDeleted: true — hidden from UI
//          Physical file is NOT deleted from disk
//          Root can see soft deleted documents
//
//          Hard delete (physical file removal) is
//          done manually or via a future cleanup job
// ─────────────────────────────────────────
const deleteDocument = asyncHandler(async (req, res) => {
  const { candidateId, docId } = req.params;

  // Verify candidate exists in this tenant
  const candidate = await verifyCandidate(candidateId, req.tenantId);

  const document = await Document.findOneAndUpdate(
    {
      _id: docId,
      tenantId: req.tenantId,
      candidateId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      },
    },
    { new: true }
  );

  if (!document) {
    throw new ApiError(404, "Document not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_DOCUMENT",
    entityType: "document",
    entityId: document._id,
    description: `${req.user.name} deleted document "${document.name}" for candidate ${candidate.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Document deleted successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/documents/:candidateId/:docId/permanent
// @access  Root only
// @desc    Permanently delete a document —
//          removes DB record AND physical file from disk
//          Only available for already soft-deleted documents
//          This is the only hard delete in the entire system
// ─────────────────────────────────────────
const permanentDeleteDocument = asyncHandler(async (req, res) => {
  const { candidateId, docId } = req.params;

  // Verify candidate exists in this tenant
  await verifyCandidate(candidateId, req.tenantId);

  // Only soft-deleted documents can be permanently deleted
  const document = await Document.findOne({
    _id: docId,
    tenantId: req.tenantId,
    candidateId,
    isDeleted: true, // must already be soft deleted
  });

  if (!document) {
    throw new ApiError(
      404,
      "Document not found or not yet soft-deleted — soft delete it first"
    );
  }

  // Delete physical file from disk if it exists
  if (document.storageProvider === "local") {
    const filename = path.basename(document.fileUrl);
    const filePath = path.join(UPLOAD_DEST, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  // When using Cloudinary/S3, call the provider's
  // delete API here using cloudinaryPublicId

  // Remove DB record
  await Document.findByIdAndDelete(docId);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "PERMANENT_DELETE_DOCUMENT",
    entityType: "document",
    entityId: document._id,
    description: `${req.user.name} permanently deleted document "${document.name}"`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Document permanently deleted")
  );
});

export {
  uploadDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  permanentDeleteDocument,
};