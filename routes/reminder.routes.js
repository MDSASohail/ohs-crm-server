// routes/reminder.routes.js
// Defines all reminder routes.
//
// POST   /api/reminders              — create reminder (root, admin, staff)
// GET    /api/reminders              — list reminders with filters (all roles)
// GET    /api/reminders/:id          — get single reminder (all roles)
// POST   /api/reminders/:id/send     — manually send reminder (root, admin, staff)
// PUT    /api/reminders/:id/cancel   — cancel pending reminder (root, admin, staff)
// DELETE /api/reminders/:id          — soft delete reminder (root, admin, staff)
//
// Note: /send route must be defined BEFORE /:id
// to prevent Express treating "send" as an id

import { Router } from "express";
import {
  createReminder,
  getReminders,
  getReminderById,
  sendReminder,
  cancelReminder,
  deleteReminder,
} from "../controllers/reminder.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All reminder routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────

// Create a new reminder
router.post(
  "/",
  checkRole("root", "admin", "staff"),
  createReminder
);

// List all reminders with filters
router.get("/", getReminders);

// ─────────────────────────────────────────
// Single reminder routes
// ─────────────────────────────────────────

// Get a single reminder by ID
router.get("/:id", getReminderById);

// ─────────────────────────────────────────
// Reminder action routes
// IMPORTANT: these must be defined BEFORE
// the generic /:id routes above in Express
// but since we are using separate HTTP methods
// (POST for send, PUT for cancel, DELETE for delete)
// there is no conflict here
// ─────────────────────────────────────────

// Manually send a reminder immediately
router.post(
  "/:id/send",
  checkRole("root", "admin", "staff"),
  sendReminder
);

// Cancel a pending reminder
router.put(
  "/:id/cancel",
  checkRole("root", "admin", "staff"),
  cancelReminder
);

// Soft delete a reminder
router.delete(
  "/:id",
  checkRole("root", "admin", "staff"),
  deleteReminder
);

export default router;