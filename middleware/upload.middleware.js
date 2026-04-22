import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import { MAX_FILE_SIZE_MB } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// ─────────────────────────────────────────
// Cloudinary storage engine
// PDFs use resource_type "image" so Cloudinary
// can render them inline via viewer URL.
// Word/Excel use "raw" — browser downloads them.
// ─────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith("image/");
    const isPdf   = file.mimetype === "application/pdf";

    return {
      folder: `ohs-crm/${req.tenantId}`,
      // Images and PDFs → "image" resource type (viewable)
      // Word, Excel, text → "raw" (downloadable)
      resource_type: image,
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    };
  },
});

// ─────────────────────────────────────────
// File type filter — PDF, Word, Excel, images
// ─────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // PDF
    "application/pdf",
    // Word
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Excel
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Text
    "text/plain",
    // Images
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
        "Unsupported file type — allowed: PDF, Word, Excel, text, JPEG, PNG, GIF, WEBP"
      ),
      false
    );
  }
};

// ─────────────────────────────────────────
// Multer instance
// ─────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

export const uploadSingle = upload.single("file");

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