// routes/institute.routes.js
// Defines all institute management routes.
//
// Core institute routes:
// POST   /api/institutes                                    — create (root, admin)
// GET    /api/institutes                                    — list all (all roles)
// GET    /api/institutes/:id                               — get single (all roles)
// PUT    /api/institutes/:id                               — update (root, admin)
// PUT    /api/institutes/:id/deactivate                    — deactivate (root, admin)
// PUT    /api/institutes/:id/activate                      — activate (root, admin)
// DELETE /api/institutes/:id                               — soft delete (root, admin)
//
// Contact person routes:
// POST   /api/institutes/:id/contacts                      — add contact (root, admin)
// PUT    /api/institutes/:id/contacts/:contactId           — update contact (root, admin)
// DELETE /api/institutes/:id/contacts/:contactId           — remove contact (root, admin)
//
// Courses offered routes:
// POST   /api/institutes/:id/courses                       — add course (root, admin)
// PUT    /api/institutes/:id/courses/:courseOfferedId      — update course (root, admin)
// DELETE /api/institutes/:id/courses/:courseOfferedId      — remove course (root, admin)

import { Router } from "express";
import {
  createInstitute,
  getInstitutes,
  getInstituteById,
  updateInstitute,
  deactivateInstitute,
  activateInstitute,
  deleteInstitute,
  addContact,
  updateContact,
  deleteContact,
  addCourseOffered,
  updateCourseOffered,
  deleteCourseOffered,
} from "../controllers/institute.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All institute routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Core institute routes
// ─────────────────────────────────────────

// Create a new institute
router.post("/", checkRole("root", "admin"), createInstitute);

// List all institutes — all authenticated roles
router.get("/", getInstitutes);

// Get a single institute by ID — all authenticated roles
router.get("/:id", getInstituteById);

// Update institute core details
router.put("/:id", checkRole("root", "admin"), updateInstitute);

// Deactivate an institute
router.put("/:id/deactivate", checkRole("root", "admin"), deactivateInstitute);

// Activate an institute
router.put("/:id/activate", checkRole("root", "admin"), activateInstitute);

// Soft delete an institute
router.delete("/:id", checkRole("root", "admin"), deleteInstitute);

// ─────────────────────────────────────────
// Contact person routes
// ─────────────────────────────────────────

// Add a contact person to an institute
router.post("/:id/contacts", checkRole("root", "admin"), addContact);

// Update a contact person
router.put(
  "/:id/contacts/:contactId",
  checkRole("root", "admin"),
  updateContact
);

// Remove a contact person
router.delete(
  "/:id/contacts/:contactId",
  checkRole("root", "admin"),
  deleteContact
);

// ─────────────────────────────────────────
// Courses offered routes
// ─────────────────────────────────────────

// Add a course to institute offerings
router.post("/:id/courses", checkRole("root", "admin"), addCourseOffered);

// Update a course offering
router.put(
  "/:id/courses/:courseOfferedId",
  checkRole("root", "admin"),
  updateCourseOffered
);

// Remove a course offering
router.delete(
  "/:id/courses/:courseOfferedId",
  checkRole("root", "admin"),
  deleteCourseOffered
);

export default router;