// routes/user.routes.js
// Defines all user management routes.
// Every route here requires:
// 1. Valid JWT access token (verifyJWT)
// 2. Root role (checkRole("root"))
//
// POST   /api/users                   — create user
// GET    /api/users                   — list all users
// GET    /api/users/:id               — get single user
// PUT    /api/users/:id               — update user
// PUT    /api/users/:id/deactivate    — deactivate user
// PUT    /api/users/:id/activate      — activate user
// DELETE /api/users/:id               — soft delete user

import { Router } from "express";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// Apply verifyJWT and checkRole("root") to
// every route in this file.
// No other role can access user management.
// ─────────────────────────────────────────
router.use(verifyJWT);
router.use(checkRole("root"));

// ─────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────

// Create a new user
router.post("/", createUser);

// List all users in the tenant
router.get("/", getUsers);

// ─────────────────────────────────────────
// Single resource routes
// ─────────────────────────────────────────

// Get a single user by ID
router.get("/:id", getUserById);

// Update user name, email, role, or password
router.put("/:id", updateUser);

// Deactivate a user — cannot log in anymore
router.put("/:id/deactivate", deactivateUser);

// Reactivate a previously deactivated user
router.put("/:id/activate", activateUser);

// Soft delete a user
router.delete("/:id", deleteUser);

export default router;