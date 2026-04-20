// routes/course.routes.js
// Defines all course management routes.
//
// POST   /api/courses                     — create course (root, admin)
// GET    /api/courses                     — list all courses (all roles)
// GET    /api/courses/:id                 — get single course (all roles)
// PUT    /api/courses/:id                 — update course (root, admin)
// PUT    /api/courses/:id/deactivate      — deactivate course (root, admin)
// PUT    /api/courses/:id/activate        — activate course (root, admin)
// DELETE /api/courses/:id                 — soft delete course (root, admin)

import { Router } from "express";
import {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deactivateCourse,
  activateCourse,
  deleteCourse,
} from "../controllers/course.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All course routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────

// Create a new course — root and admin only
router.post("/", checkRole("root", "admin"), createCourse);

// List all courses — all authenticated roles
router.get("/", getCourses);

// ─────────────────────────────────────────
// Single resource routes
// ─────────────────────────────────────────

// Get a single course by ID — all authenticated roles
router.get("/:id", getCourseById);

// Update course details — root and admin only
router.put("/:id", checkRole("root", "admin"), updateCourse);

// Deactivate a course — root and admin only
router.put("/:id/deactivate", checkRole("root", "admin"), deactivateCourse);

// Activate a course — root and admin only
router.put("/:id/activate", checkRole("root", "admin"), activateCourse);

// Soft delete a course — root and admin only
router.delete("/:id", checkRole("root", "admin"), deleteCourse);

export default router;