// routes/tenant.routes.js
// Defines all tenant profile routes.
//
// GET  /api/tenant             — get current tenant profile (all roles)
// PUT  /api/tenant             — update tenant profile (root only)
// PUT  /api/tenant/deactivate  — deactivate tenant account (root only)
//
// All routes require a valid JWT access token.
// Write operations are restricted to root role only.

import { Router } from "express";
import {
  getTenant,
  updateTenant,
  deactivateTenant,
} from "../controllers/tenant.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// Apply verifyJWT to all routes in this file
// Every tenant route requires authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// GET /api/tenant
// All authenticated roles can view tenant profile
// ─────────────────────────────────────────
router.get("/", getTenant);

// ─────────────────────────────────────────
// PUT /api/tenant
// Only root can update tenant profile
// ─────────────────────────────────────────
router.put("/", checkRole("root"), updateTenant);

// ─────────────────────────────────────────
// PUT /api/tenant/deactivate
// Only root can deactivate the tenant account
// ─────────────────────────────────────────
router.put("/deactivate", checkRole("root"), deactivateTenant);

export default router;