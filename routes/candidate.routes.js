// routes/candidate.routes.js
// Defines all candidate management routes.
//
// POST   /api/candidates          — create candidate (root, admin, staff)
// GET    /api/candidates          — list all candidates (all roles)
// GET    /api/candidates/search   — search candidates (all roles)
// GET    /api/candidates/:id      — get single candidate (all roles)
// PUT    /api/candidates/:id      — update candidate (root, admin, staff)
// DELETE /api/candidates/:id      — soft delete (root, admin, staff)
//
// Note: /search must be defined BEFORE /:id
// otherwise Express will treat "search" as an id

import { Router } from "express";
import {
  createCandidate,
  getCandidates,
  searchCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
} from "../controllers/candidate.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All candidate routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────

// Create a new candidate
router.post(
  "/",
  checkRole("root", "admin", "staff"),
  createCandidate
);

// List all candidates with pagination and filters
router.get("/", getCandidates);

// ─────────────────────────────────────────
// Search route
// IMPORTANT: must be defined before /:id
// so Express does not treat "search" as an id
// ─────────────────────────────────────────
router.get("/search", searchCandidates);

// ─────────────────────────────────────────
// Single resource routes
// ─────────────────────────────────────────

// Get a single candidate by ID
router.get("/:id", getCandidateById);

// Update candidate details
router.put(
  "/:id",
  checkRole("root", "admin", "staff"),
  updateCandidate
);

// Soft delete a candidate
router.delete(
  "/:id",
  checkRole("root", "admin", "staff"),
  deleteCandidate
);

export default router;