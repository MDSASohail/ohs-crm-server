// routes/activitylog.routes.js
// Defines all activity log routes.
// Read-only — no data mutation.
// Only Root and Admin can access these routes.
//
// GET /api/activity-logs                           — list all logs with filters
// GET /api/activity-logs/summary                   — activity summary
// GET /api/activity-logs/:entityType/:entityId     — logs for a specific record
//
// IMPORTANT: /summary must be defined BEFORE
// /:entityType/:entityId to prevent Express
// treating "summary" as an entityType param

import { Router } from "express";
import {
  getActivityLogs,
  getEntityLogs,
  getActivitySummary,
} from "../controllers/activitylog.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All activity log routes require
// authentication and root or admin role
// ─────────────────────────────────────────
router.use(verifyJWT);
router.use(checkRole("root", "admin"));

// ─────────────────────────────────────────
// List all logs with filters and pagination
// ─────────────────────────────────────────
router.get("/", getActivityLogs);

// ─────────────────────────────────────────
// Summary route
// MUST be defined before /:entityType/:entityId
// ─────────────────────────────────────────
router.get("/summary", getActivitySummary);

// ─────────────────────────────────────────
// Logs for a specific record
// e.g. GET /api/activity-logs/candidate/<id>
//      GET /api/activity-logs/enrollment/<id>
// ─────────────────────────────────────────
router.get("/:entityType/:entityId", getEntityLogs);

export default router;