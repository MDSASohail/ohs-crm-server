// routes/payment.routes.js
// Defines all payment tracking routes.
// All routes are scoped to an enrollment via :enrollmentId.
//
// Payment record routes:
// POST   /api/payments                                           — create payment record (root, admin, staff)
// GET    /api/payments/:enrollmentId                            — get payment (all roles)
// PUT    /api/payments/:enrollmentId                            — update fee/deadline (root, admin, staff)
//
// Transaction routes:
// POST   /api/payments/:enrollmentId/transactions               — add transaction (root, admin, staff)
// PUT    /api/payments/:enrollmentId/transactions/:transactionId — update transaction (root, admin, staff)
// DELETE /api/payments/:enrollmentId/transactions/:transactionId — remove transaction (root, admin, staff)
//
// Expense routes:
// POST   /api/payments/:enrollmentId/expenses                   — add expense (root, admin, staff)
// PUT    /api/payments/:enrollmentId/expenses/:expenseId        — update expense (root, admin, staff)
// DELETE /api/payments/:enrollmentId/expenses/:expenseId        — remove expense (root, admin, staff)

import { Router } from "express";
import {
  createPayment,
  getPayment,
  updatePayment,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addExpense,
  updateExpense,
  deleteExpense,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = Router();

// ─────────────────────────────────────────
// All payment routes require authentication
// ─────────────────────────────────────────
router.use(verifyJWT);

// ─────────────────────────────────────────
// Payment record routes
// ─────────────────────────────────────────

// Create a payment record for an enrollment
router.post(
  "/",
  checkRole("root", "admin", "staff"),
  createPayment
);

// Get payment record for an enrollment
router.get("/:enrollmentId", getPayment);

// Update total fee and/or deadline
router.put(
  "/:enrollmentId",
  checkRole("root", "admin", "staff"),
  updatePayment
);

// ─────────────────────────────────────────
// Transaction routes
// ─────────────────────────────────────────

// Add a payment transaction
router.post(
  "/:enrollmentId/transactions",
  checkRole("root", "admin", "staff"),
  addTransaction
);

// Update a transaction
router.put(
  "/:enrollmentId/transactions/:transactionId",
  checkRole("root", "admin", "staff"),
  updateTransaction
);

// Remove a transaction
router.delete(
  "/:enrollmentId/transactions/:transactionId",
  checkRole("root", "admin", "staff"),
  deleteTransaction
);

// ─────────────────────────────────────────
// Expense routes
// ─────────────────────────────────────────

// Add an expense
router.post(
  "/:enrollmentId/expenses",
  checkRole("root", "admin", "staff"),
  addExpense
);

// Update an expense
router.put(
  "/:enrollmentId/expenses/:expenseId",
  checkRole("root", "admin", "staff"),
  updateExpense
);

// Remove an expense
router.delete(
  "/:enrollmentId/expenses/:expenseId",
  checkRole("root", "admin", "staff"),
  deleteExpense
);

export default router;