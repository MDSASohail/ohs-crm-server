// middleware/upload.middleware.js
// Configures Multer for local disk storage.
//
// During development, files are saved to the
// /uploads folder in the server root.
// The /uploads route is served as static files
// from server.js so files are accessible via:
// http://localhost:5000/uploads/filename.ext
//
// When switching to Cloudinary or S3:
// — Replace diskStorage with the appropriate
//   Multer storage engine
// — Update fileUrl generation in document.controller.js
// — Nothing else in the codebase needs to change
//
// File size limit is read from env (MAX_FILE_SIZE_MB)
// so it can be changed from Settings without redeployment.
//
// Allowed file types:
// — PDF, Word documents, text files, images
// — Controlled by the fileFilter function below

import multer from "multer";
import path from "path";
import fs from "fs";
import { MAX_FILE_SIZE_MB, UPLOAD_DEST } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// ─────────────────────────────────────────
// Ensure the uploads directory exists
// Creates it automatically if it doesn't —
// prevents Multer from crashing on first upload
// ─────────────────────────────────────────
if (!fs.existsSync(UPLOAD_DEST)) {
  fs.mkdirSync(UPLOAD_DEST, { recursive: true });
}

// ─────────────────────────────────────────
// Disk storage configuration
// Files are saved with a unique name to prevent
// collisions — timestamp + random number + original extension
// ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DEST);
  },

  filename: (req, file, cb) => {
    // Build a unique filename:
    // timestamp-randomNumber.originalExtension
    // e.g. 1718000000000-483920.pdf
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// ─────────────────────────────────────────
// File type filter
// Only allow safe, expected file types.
// Rejects anything else with a clear error.
// ─────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // PDF
    "application/pdf",
    // Word documents
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Text
    "text/plain",
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(
      new ApiError(
        415,
        "Unsupported file type — allowed types: PDF, Word, text, JPEG, PNG, GIF, WEBP"
      ),
      false // Reject file
    );
  }
};

// ─────────────────────────────────────────
// Multer instance
// MAX_FILE_SIZE_MB comes from .env and can
// be changed in Settings later
// ─────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, // Convert MB to bytes
  },
});

// ─────────────────────────────────────────
// Export named middleware functions
// upload.single("file") — expects one file
//   with field name "file" in the form data
// ─────────────────────────────────────────
export const uploadSingle = upload.single("file");

// ─────────────────────────────────────────
// Multer error handler wrapper
// Multer errors do not go through asyncHandler
// so we need to catch them manually and convert
// them to ApiError format for the global handler
// ─────────────────────────────────────────
export const handleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (!err) return next();

    // Multer file size error
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(
        new ApiError(
          413,
          `File too large — maximum allowed size is ${MAX_FILE_SIZE_MB}MB`
        )
      );
    }

    // Multer unexpected field error
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return next(
        new ApiError(400, "Unexpected field — use field name 'file' for upload")
      );
    }

    // ApiError thrown by fileFilter (wrong file type)
    if (err instanceof ApiError) {
      return next(err);
    }

    // Any other Multer error
    return next(new ApiError(400, err.message || "File upload failed"));
  });
};