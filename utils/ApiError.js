// utils/ApiError.js
// Custom error class for all API errors.
// Extends native Error so it works naturally with
// try/catch and Express error middleware.
//
// Shape sent to client:
// {
//   statusCode: 404,
//   success: false,
//   message: "Candidate not found",
//   errors: []
// }

class ApiError extends Error {
  constructor(
    statusCode,
    message = "Something went wrong",
    errors = [],
    stack = ""
  ) {
    // Call native Error constructor with the message
    // so error.message works as expected
    super(message);

    this.statusCode = statusCode;
    this.success = false;
    this.message = message;
    this.errors = errors;

    // ─────────────────────────────────────────
    // Stack trace handling —
    // If a stack is passed in (e.g. from a caught
    // error), use it. Otherwise capture a fresh one.
    // This keeps the trace pointing at the real
    // origin of the error, not this constructor.
    // ─────────────────────────────────────────
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };