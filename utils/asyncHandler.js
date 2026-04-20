// utils/asyncHandler.js
// Wraps async route handlers to automatically catch errors
// and forward them to Express's global error middleware.
//
// Usage:
// export const getCandidate = asyncHandler(async (req, res) => {
//   const candidate = await Candidate.findById(req.params.id);
//   if (!candidate) throw new ApiError(404, "Candidate not found");
//   res.status(200).json(new ApiResponse(200, candidate, "Fetched"));
// });
//
// No try/catch needed anywhere in controllers.

const asyncHandler = (fn) => {
  return (req, res, next) => {
    // Execute the async function —
    // if it throws or rejects, catch it and
    // pass to Express error middleware via next()
    Promise.resolve(fn(req, res, next)).catch((error) => next(error));
  };
};

export { asyncHandler };