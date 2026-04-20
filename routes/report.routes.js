// routes/report.routes.js
// Defines all report and export routes.
//
// Report routes (all roles):
// GET /api/reports/enrollments          — enrollment report with filters
// GET /api/reports/payments             — payment summary report
// GET /api/reports/institutes           — institute comparison report
//
// Export routes (root, admin only):
// GET /api/reports/enrollments/export   — export enrollments to Excel
// GET /api/reports/payments/export      — export payments to Excel
//
// IMPORTANT: export routes must be defined BEFORE
// the base report routes to prevent Express
// treating "export" as a query parameter conflict

import { Router } from "express";
import {
  getEnrollmentReport,
  getPaymentReport,
  getInstituteReport,
  exportEnrollmentsExcel,
  exportPaymentsExcel,
} from "../controllers/report.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All report routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Export routes
// MUST be defined before the base routes
// Root and Admin only
// ─────────────────────────────────────────

// Export enrollment report to Excel
router.get(
  "/enrollments/export",
  checkRole("root", "admin"),
  exportEnrollmentsExcel
);

// Export payment report to Excel
router.get(
  "/payments/export",
  checkRole("root", "admin"),
  exportPaymentsExcel
);

// ─────────────────────────────────────────
// Report routes — all authenticated roles
// ─────────────────────────────────────────

// Enrollment report with filters and pagination
router.get("/enrollments", getEnrollmentReport);

// Payment summary report
router.get("/payments", getPaymentReport);

// Institute comparison report
router.get("/institutes", getInstituteReport);

export default router;