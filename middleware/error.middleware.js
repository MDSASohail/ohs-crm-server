// middleware/error.middleware.js
// Global error handler for the entire Express app.
// Receives all errors forwarded via next(error) —
// whether thrown manually as ApiError instances,
// caught by asyncHandler, or unexpected runtime errors.
//
// Must be registered LAST in server.js — after all
// routes — because Express identifies error middleware
// by its four arguments (err, req, res, next).
//
// Sends a consistent error shape to the client:
// {
//   statusCode: 404,
//   success: false,
//   message: "Candidate not found",
//   errors: [],
//   stack: "..." (development only)
// }

import { NODE_ENV } from "../config/env.js";

const errorHandler = (err, req, res, next) => {
  // ─────────────────────────────────────────
  // Determine status code
  // Use the error's statusCode if it was set
  // (ApiError always sets it).
  // Fall back to 500 for unexpected runtime errors.
  // ─────────────────────────────────────────
  const statusCode = err.statusCode || 500;

  // ─────────────────────────────────────────
  // Determine message
  // For 500s in production, never expose internal
  // error details — return a generic message.
  // In development, show the real message always.
  // ─────────────────────────────────────────
  const message =
    NODE_ENV === "production" && statusCode === 500
      ? "Internal Server Error"
      : err.message || "Something went wrong";

  // ─────────────────────────────────────────
  // Log the error
  // Always log in development.
  // In production, only log 500s — 4xx errors
  // are expected client mistakes, not server faults.
  // ─────────────────────────────────────────
  if (NODE_ENV === "development") {
    console.error(`❌ [${req.method}] ${req.originalUrl} — ${statusCode}`);
    console.error(err);
  } else if (statusCode >= 500) {
    console.error(`❌ [${req.method}] ${req.originalUrl} — ${statusCode}`);
    console.error(err.message);
  }

  // ─────────────────────────────────────────
  // Handle specific Mongoose errors
  // Convert them into clean ApiError-like shapes
  // so the client always gets a consistent response
  // ─────────────────────────────────────────

  // Mongoose duplicate key error (unique index violation)
  // e.g. duplicate email within a tenant
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      statusCode: 409,
      success: false,
      message: `Duplicate value for ${field} — this ${field} already exists`,
      errors: [],
    });
  }

  // Mongoose validation error
  // e.g. required field missing
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({
      statusCode: 422,
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // Mongoose cast error
  // e.g. invalid ObjectId format in URL param
  if (err.name === "CastError") {
    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: `Invalid value for ${err.path} — ${err.value} is not a valid ID`,
      errors: [],
    });
  }

  // ─────────────────────────────────────────
  // Default error response
  // ─────────────────────────────────────────
  res.status(statusCode).json({
    statusCode,
    success: false,
    message,
    errors: err.errors || [],
    // Stack trace only in development — never expose
    // internal stack traces in production
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
};

export { errorHandler };