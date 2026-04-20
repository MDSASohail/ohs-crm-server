// controllers/auth.controller.js
// Handles all authentication operations:
// — login        POST /api/auth/login
// — logout       POST /api/auth/logout
// — refresh      POST /api/auth/refresh
// — me           GET  /api/auth/me
//
// Registration is not a public endpoint.
// New users are created by Root users only (Phase 5).
// The first user is always created via the seed script.
//
// Token strategy:
// — Access token  → short-lived (15m), sent in response body,
//                   stored in Redux on the frontend
// — Refresh token → long-lived (7d), stored in httpOnly cookie,
//                   also saved in DB so we can invalidate it

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/User.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";
import {
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRY,
  NODE_ENV,
} from "../config/env.js";

// ─────────────────────────────────────────
// Helper — generate access token
// Payload contains just enough to identify
// the user and their tenant on every request
// ─────────────────────────────────────────
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// ─────────────────────────────────────────
// Helper — generate refresh token
// Minimal payload — just the user ID.
// The DB is the source of truth for validity.
// ─────────────────────────────────────────
const generateRefreshToken = (user) => {
  return jwt.sign(
    { _id: user._id },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

// ─────────────────────────────────────────
// Helper — cookie options for refresh token
// httpOnly   → JS cannot read it (XSS protection)
// secure     → HTTPS only in production
// sameSite   → CSRF protection
// maxAge     → 7 days in milliseconds
// ─────────────────────────────────────────

// Local
// const refreshTokenCookieOptions = {
//   httpOnly: true,
//   secure: NODE_ENV === "production",
//   sameSite: NODE_ENV === "production" ? "strict" : "lax",
//   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
// };

//Production
const refreshTokenCookieOptions = {
  httpOnly: true,
  secure:  process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 1 * 24 * 60 * 60 * 1000, // 7 days
};



// ─────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
// @desc    Validate credentials, return access token
//          and set refresh token in httpOnly cookie
// ─────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  

  // Basic input validation
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  // Find user by email — must be active and not deleted
  // We explicitly select password here because it is
  // excluded by default in the User model's toJSON transform
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    isDeleted: false,
    isActive: true,
  }).select("+password +refreshToken");

  if (!user) {
    // Deliberately vague — do not reveal whether the email
    // exists or not (prevents user enumeration attacks)
    throw new ApiError(401, "Invalid email or password");
  }

  // Verify password against bcrypt hash
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Generate both tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refresh token to DB so we can invalidate
  // it on logout or suspicious activity
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Set refresh token as httpOnly cookie
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  // Build safe user object to return —
  // password and refreshToken are stripped by
  // the model's toJSON transform automatically
  const safeUser = user.toJSON();

  // Log the login activity
  await logActivity({
    tenantId: user.tenantId,
    userId: user._id,
    action: "LOGIN",
    entityType: "user",
    entityId: user._id,
    description: `${user.name} logged in`,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        accessToken,
        user: safeUser,
      },
      "Login successful"
    )
  );
});

// ─────────────────────────────────────────
// @route   POST /api/auth/logout
// @access  Protected
// @desc    Clear refresh token from DB and cookie
// ─────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  // req.user is set by verifyJWT middleware
  const userId = req.user._id;

  // Clear refresh token in DB
  await User.findByIdAndUpdate(
    userId,
    { refreshToken: null },
    { new: true }
  );

  // Clear the httpOnly cookie
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "strict" : "lax",
  });

  // Log the logout activity
  await logActivity({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    action: "LOGOUT",
    entityType: "user",
    entityId: req.user._id,
    description: `${req.user.name} logged out`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Logged out successfully")
  );
});

// ─────────────────────────────────────────
// @route   POST /api/auth/refresh
// @access  Public (uses httpOnly cookie)
// @desc    Verify refresh token from cookie,
//          issue a new access token
//
// This is called automatically by the Axios
// interceptor on the frontend when a 401 is
// received — the user never sees this happen.
// ─────────────────────────────────────────
const refreshAccessToken = asyncHandler(async (req, res) => {
  // Read refresh token from httpOnly cookie
  const incomingRefreshToken = req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized — no refresh token");
  }

  // Verify the refresh token signature and expiry
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, REFRESH_TOKEN_SECRET);
  } catch (error) {
    throw new ApiError(401, "Unauthorized — invalid or expired refresh token");
  }

  // Find user and compare stored refresh token
  // We select refreshToken explicitly here because
  // it is excluded from default queries
  const user = await User.findOne({
    _id: decoded._id,
    isDeleted: false,
    isActive: true,
  }).select("+refreshToken");

  if (!user) {
    throw new ApiError(401, "Unauthorized — user not found");
  }

  // Compare the incoming token with what is stored in DB
  // If they don't match, the token has been invalidated
  // (e.g. user logged out on another device)
  if (user.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized — refresh token mismatch");
  }

  // Issue a new access token
  const newAccessToken = generateAccessToken(user);

  // Optionally rotate the refresh token —
  // issue a new one and update the cookie and DB.
  // This limits the window of a stolen refresh token.
  const newRefreshToken = generateRefreshToken(user);
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions);

  return res.status(200).json(
    new ApiResponse(
      200,
      { accessToken: newAccessToken },
      "Access token refreshed"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/auth/me
// @access  Protected
// @desc    Return the currently logged-in user's
//          profile — used on app load to rehydrate
//          Redux auth state
// ─────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  // req.user is already attached by verifyJWT middleware
  // No DB query needed — user is already loaded
  return res.status(200).json(
    new ApiResponse(200, req.user, "User profile fetched successfully")
  );
});

export { login, logout, refreshAccessToken, getMe };