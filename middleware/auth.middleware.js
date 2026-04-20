// middleware/auth.middleware.js
// Verifies the JWT access token on every protected route.
//
// Flow:
// 1. Extract token from Authorization header (Bearer <token>)
// 2. Verify token signature and expiry using ACCESS_TOKEN_SECRET
// 3. Find the user in DB — confirms user still exists and is active
// 4. Attach user and tenantId to req for downstream controllers
//
// If anything fails, throw 401 — never expose why the token
// failed to the client (security best practice).

import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ACCESS_TOKEN_SECRET } from "../config/env.js";

const verifyJWT = asyncHandler(async (req, res, next) => {
  // ─────────────────────────────────────────
  // Step 1 — Extract token from header
  // Expected format: "Authorization: Bearer <token>"
  // ─────────────────────────────────────────
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Unauthorized — no token provided");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw new ApiError(401, "Unauthorized — malformed token");
  }

  // ─────────────────────────────────────────
  // Step 2 — Verify token signature and expiry
  // jwt.verify throws if token is invalid or expired
  // ─────────────────────────────────────────
  let decoded;
  try {
    decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (error) {
    // TokenExpiredError or JsonWebTokenError —
    // both return 401, never expose the specific reason
    throw new ApiError(401, "Unauthorized — invalid or expired token");
  }

  // ─────────────────────────────────────────
  // Step 3 — Find user in database
  // Confirms the user account still exists,
  // is active, and has not been soft deleted.
  // We exclude password and refreshToken —
  // they are never needed in request context.
  // ─────────────────────────────────────────
  const user = await User.findOne({
    _id: decoded._id,
    isDeleted: false,
    isActive: true,
  }).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(401, "Unauthorized — user not found or inactive");
  }

  // ─────────────────────────────────────────
  // Step 4 — Attach to request
  // req.user     — full user object (no password/refreshToken)
  // req.tenantId — shortcut used by every controller and
  //                middleware for tenant isolation queries
  // ─────────────────────────────────────────
  req.user = user;
  req.tenantId = user.tenantId;

  next();
});

export { verifyJWT };