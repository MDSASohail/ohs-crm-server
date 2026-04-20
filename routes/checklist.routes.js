// routes/checklist.routes.js
// Defines all checklist template routes.
// All routes are scoped to a course via :courseId.
//
// POST   /api/checklists/:courseId              — create template (root, admin)
// GET    /api/checklists/:courseId              — get template (all roles)
// DELETE /api/checklists/:courseId              — delete template (root, admin)
// POST   /api/checklists/:courseId/steps        — add a step (root, admin)
// PUT    /api/checklists/:courseId/steps/:stepId — update a step (root, admin)
// DELETE /api/checklists/:courseId/steps/:stepId — delete a step (root, admin)
// PUT    /api/checklists/:courseId/reorder      — reorder steps (root, admin)

import { Router } from "express";
import {
  createTemplate,
  getTemplate,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  deleteTemplate,
} from "../controllers/checklist.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All checklist routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Template level routes
// Scoped to a course via :courseId
// ─────────────────────────────────────────

// Create a new template for a course
router.post(
  "/:courseId",
  checkRole("root", "admin"),
  createTemplate
);

// Get the template for a course — all roles
router.get("/:courseId", getTemplate);

// Soft delete the entire template
router.delete(
  "/:courseId",
  checkRole("root", "admin"),
  deleteTemplate
);

// ─────────────────────────────────────────
// Step level routes
// Scoped to a specific step via :stepId
// ─────────────────────────────────────────

// Add a new step to the template
router.post(
  "/:courseId/steps",
  checkRole("root", "admin"),
  addStep
);

// Update a specific step
router.put(
  "/:courseId/steps/:stepId",
  checkRole("root", "admin"),
  updateStep
);

// Delete a specific step
router.delete(
  "/:courseId/steps/:stepId",
  checkRole("root", "admin"),
  deleteStep
);

// ─────────────────────────────────────────
// Reorder route
// ─────────────────────────────────────────

// Reorder all steps by providing new order values
router.put(
  "/:courseId/reorder",
  checkRole("root", "admin"),
  reorderSteps
);

export default router;