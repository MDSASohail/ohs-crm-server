// routes/dashboard.routes.js
// Defines all dashboard data routes.
// All routes are read-only — no data mutation.
// All roles can access dashboard data.
//
// GET /api/dashboard/summary               — counts and totals
// GET /api/dashboard/enrollments-by-month  — chart data
// GET /api/dashboard/pass-fail-ratio       — by course and institute
// GET /api/dashboard/upcoming-dates        — exams and results this week
// GET /api/dashboard/pending-checklist     — incomplete steps
// GET /api/dashboard/overdue-payments      — overdue payment records

import { Router } from "express";
import {
  getSummary,
  getEnrollmentsByMonth,
  getPassFailRatio,
  getUpcomingDates,
  getPendingChecklist,
  getOverduePayments,
} from "../controllers/dashboard.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All dashboard routes require authentication
// No role restriction — all roles can view
// the dashboard
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Dashboard data routes
// ─────────────────────────────────────────

// Summary counts and financial totals
router.get("/summary", getSummary);

// Enrollment count per month — used for bar/line chart
router.get("/enrollments-by-month", getEnrollmentsByMonth);

// Pass/fail ratio by course and institute
router.get("/pass-fail-ratio", getPassFailRatio);

// Upcoming exam and result dates this week
router.get("/upcoming-dates", getUpcomingDates);

// Enrollments with pending checklist steps
router.get("/pending-checklist", getPendingChecklist);

// Overdue payment records
router.get("/overdue-payments", getOverduePayments);

export default router;