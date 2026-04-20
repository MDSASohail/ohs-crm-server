// routes/enrollment.routes.js
// Defines all enrollment and checklist engine routes.
//
// Enrollment routes:
// POST   /api/enrollments                              — create (root, admin, staff)
// GET    /api/enrollments                              — list all (all roles)
// GET    /api/enrollments/:id                          — get single (all roles)
// PUT    /api/enrollments/:id                          — update (root, admin, staff)
// DELETE /api/enrollments/:id                          — soft delete (root, admin, staff)
//
// Checklist engine routes:
// PUT    /api/enrollments/:id/checklist/:stepId/done   — mark step done (root, admin, staff)
// PUT    /api/enrollments/:id/checklist/:stepId/undone — mark step undone (root, admin, staff)
// PUT    /api/enrollments/:id/checklist/:stepId/skip   — skip step (root, admin, staff)
// PUT    /api/enrollments/:id/checklist/:stepId        — update step fields (root, admin, staff)
//
// Note: specific checklist action routes (done, undone, skip)
// must be defined BEFORE the generic /:stepId route
// to prevent Express treating "done" as a stepId

import { Router } from "express";
import {
  createEnrollment,
  getEnrollments,
  getEnrollmentById,
  updateEnrollment,
  deleteEnrollment,
  markStepDone,
  markStepUndone,
  skipStep,
  updateStepFields,
} from "../controllers/enrollment.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All enrollment routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Enrollment collection routes
// ─────────────────────────────────────────

// Create a new enrollment
router.post(
  "/",
  checkRole("root", "admin", "staff"),
  createEnrollment
);

// List all enrollments with filters and pagination
router.get("/", getEnrollments);

// ─────────────────────────────────────────
// Single enrollment routes
// ─────────────────────────────────────────

// Get a single enrollment by ID — includes full checklist
router.get("/:id", getEnrollmentById);

// Update enrollment details and status
router.put(
  "/:id",
  checkRole("root", "admin", "staff"),
  updateEnrollment
);

// Soft delete an enrollment
router.delete(
  "/:id",
  checkRole("root", "admin", "staff"),
  deleteEnrollment
);

// ─────────────────────────────────────────
// Checklist engine routes
// IMPORTANT: done, undone, skip routes must
// be defined BEFORE the generic /:stepId route
// ─────────────────────────────────────────

// Mark a checklist step as done
router.put(
  "/:id/checklist/:stepId/done",
  checkRole("root", "admin", "staff"),
  markStepDone
);

// Unmark a completed or skipped step
router.put(
  "/:id/checklist/:stepId/undone",
  checkRole("root", "admin", "staff"),
  markStepUndone
);

// Skip a checklist step
router.put(
  "/:id/checklist/:stepId/skip",
  checkRole("root", "admin", "staff"),
  skipStep
);

// Update optional fields on a step
// (date, assignedTo, note) without changing done state
router.put(
  "/:id/checklist/:stepId",
  checkRole("root", "admin", "staff"),
  updateStepFields
);

export default router;