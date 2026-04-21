// middleware/upload.middleware.js
// Multer configured with Cloudinary storage.
// Files go directly to Cloudinary — nothing is
// saved to disk. Works identically in development
// and production.
//
// Cloudinary organises files into folders per tenant
// so each business's files are separated.
// The public_id and secure_url are returned in req.file
// and used by document.controller.js to build the DB record.

import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import { MAX_FILE_SIZE_MB } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// ─────────────────────────────────────────
// Cloudinary storage engine
// Each file is stored under:
// ohs-crm/<tenantId>/<timestamp>-<random>
// This keeps files organised per tenant
// ─────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Determine resource type based on mimetype
    // Cloudinary needs this to handle non-image files
    const isImage = file.mimetype.startsWith("image/");
    const isPdf   = file.mimetype === "application/pdf";

    return {
      folder: `ohs-crm/${req.tenantId}`,
      resource_type: isImage ? "image" : "raw",
      // Use timestamp + random for unique public_id
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      // For images, allow transformations
      ...(isImage && { allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"] }),
    };
  },
});

// ─────────────────────────────────────────
// File type filter — same as before
// ─────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        415,
        "Unsupported file type — allowed: PDF, Word, text, JPEG, PNG, GIF, WEBP"
      ),
      false
    );
  }
};

// ─────────────────────────────────────────
// Multer instance with Cloudinary storage
// ─────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

export const uploadSingle = upload.single("file");

// ─────────────────────────────────────────
// Error handler wrapper — same as before
// ─────────────────────────────────────────
export const handleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      return next(
        new ApiError(413, `File too large — maximum allowed size is ${MAX_FILE_SIZE_MB}MB`)
      );
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return next(
        new ApiError(400, "Unexpected field — use field name 'file' for upload")
      );
    }

    if (err instanceof ApiError) return next(err);

    return next(new ApiError(400, err.message || "File upload failed"));
  });
};