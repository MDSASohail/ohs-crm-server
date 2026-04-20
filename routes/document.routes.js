// routes/document.routes.js
// Defines all document management routes.
// All routes are scoped to a candidate via :candidateId.
//
// POST   /api/documents/:candidateId                      — upload file (root, admin, staff)
// GET    /api/documents/:candidateId                      — list documents (all roles)
// GET    /api/documents/:candidateId/:docId               — get single document (all roles)
// PUT    /api/documents/:candidateId/:docId               — rename document (root, admin, staff)
// DELETE /api/documents/:candidateId/:docId               — soft delete (root, admin, staff)
// DELETE /api/documents/:candidateId/:docId/permanent     — hard delete (root only)

import { Router } from "express";
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  permanentDeleteDocument,
} from "../controllers/document.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { handleUpload } from "../middleware/upload.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All document routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Upload a file for a candidate
// handleUpload runs Multer before the controller
// It must come before checkRole in the chain so
// Multer errors are handled cleanly
// ─────────────────────────────────────────
router.post(
  "/:candidateId",
  checkRole("root", "admin", "staff"),
  handleUpload,
  uploadDocument
);

// ─────────────────────────────────────────
// List all documents for a candidate
// ─────────────────────────────────────────
router.get("/:candidateId", getDocuments);

// ─────────────────────────────────────────
// Single document routes
// ─────────────────────────────────────────

// Get a single document by ID
router.get("/:candidateId/:docId", getDocumentById);

// Rename a document
router.put(
  "/:candidateId/:docId",
  checkRole("root", "admin", "staff"),
  updateDocument
);

// Soft delete a document
router.delete(
  "/:candidateId/:docId",
  checkRole("root", "admin", "staff"),
  deleteDocument
);

// ─────────────────────────────────────────
// Permanent delete — root only
// Must be defined before /:candidateId/:docId
// to avoid Express treating "permanent" as docId
// ─────────────────────────────────────────
router.delete(
  "/:candidateId/:docId/permanent",
  checkRole("root"),
  permanentDeleteDocument
);

export default router;