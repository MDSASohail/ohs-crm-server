// routes/auth.routes.js
// Defines all authentication routes.
//
// Public routes (no token required):
// POST /api/auth/login    — submit credentials, get tokens
// POST /api/auth/refresh  — exchange refresh cookie for new access token
//
// Protected routes (valid access token required):
// POST /api/auth/logout   — clear tokens and cookie
// GET  /api/auth/me       — get current logged-in user profile

import { Router } from "express";
import {
  login,
  logout,
  refreshAccessToken,
  getMe,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// Public routes
// No authentication required
// ─────────────────────────────────────────

// Login — validate credentials and issue tokens
router.post("/login", login);

// Refresh — use httpOnly cookie to get a new access token
// Called automatically by the Axios interceptor on 401
router.post("/refresh", refreshAccessToken);

// ─────────────────────────────────────────
// Protected routes
// verifyJWT middleware runs before the controller
// ─────────────────────────────────────────

// Logout — clear refresh token from DB and cookie
router.post("/logout", verifyJWT, logout);

// Me — return current user profile for Redux rehydration
router.get("/me", verifyJWT, getMe);

export default router;