// controllers/payment.controller.js
// Handles all payment tracking for enrollments.
//
// Routes:
// POST   /api/payments                              — create payment record (root, admin, staff)
// GET    /api/payments/:enrollmentId                — get payment for enrollment (all roles)
// PUT    /api/payments/:enrollmentId                — update fee and deadline (root, admin, staff)
// POST   /api/payments/:enrollmentId/transactions   — add a transaction (root, admin, staff)
// PUT    /api/payments/:enrollmentId/transactions/:transactionId  — update transaction
// DELETE /api/payments/:enrollmentId/transactions/:transactionId  — remove transaction
// POST   /api/payments/:enrollmentId/expenses       — add an expense (root, admin, staff)
// PUT    /api/payments/:enrollmentId/expenses/:expenseId          — update expense
// DELETE /api/payments/:enrollmentId/expenses/:expenseId          — remove expense
//
// Design decisions:
// — One Payment document per enrollment (enforced by unique index)
// — Calculated fields (totalPaid, remainingBalance, etc.)
//   are computed fresh on every read — never stored
// — Payment status (complete/partial/overdue) is
//   calculated automatically based on amounts and deadline
// — candidateId is denormalized for faster queries

import Payment from "../models/Payment.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// Helper — calculate payment summary
// Called on every read to ensure accuracy
// Never stored in DB — always computed fresh
// ─────────────────────────────────────────
const calculatePaymentSummary = (payment) => {
  const totalPaid = payment.transactions.reduce(
    (sum, t) => sum + t.amount,
    0
  );

  const totalExpenses = payment.expenses.reduce(
    (sum, e) => sum + e.amount,
    0
  );

  const remainingBalance = payment.totalFeeCharged - totalPaid;
  const amountSaved = totalPaid - totalExpenses;

  // Calculate payment status
  let paymentStatus = "partial";

  if (totalPaid >= payment.totalFeeCharged && payment.totalFeeCharged > 0) {
    paymentStatus = "complete";
  } else if (
    payment.paymentDeadline &&
    new Date() > new Date(payment.paymentDeadline) &&
    totalPaid < payment.totalFeeCharged
  ) {
    paymentStatus = "overdue";
  } else if (totalPaid === 0) {
    paymentStatus = "unpaid";
  }

  return {
    totalPaid,
    totalExpenses,
    remainingBalance,
    amountSaved,
    paymentStatus,
  };
};

// ─────────────────────────────────────────
// Helper — verify enrollment exists and
// belongs to this tenant
// ─────────────────────────────────────────
const verifyEnrollment = async (enrollmentId, tenantId) => {
  const enrollment = await Enrollment.findOne({
    _id: enrollmentId,
    tenantId,
    isDeleted: false,
  }).populate("candidateId", "fullName");

  if (!enrollment) {
    throw new ApiError(404, "Enrollment not found");
  }

  return enrollment;
};

// ─────────────────────────────────────────
// @route   POST /api/payments
// @access  Root, Admin, Staff
// @desc    Create a payment record for an enrollment
//          One payment record per enrollment —
//          fails if one already exists
// ─────────────────────────────────────────
const createPayment = asyncHandler(async (req, res) => {
  const { enrollmentId, totalFeeCharged, paymentDeadline } = req.body;

  if (!enrollmentId) {
    throw new ApiError(400, "enrollmentId is required");
  }

  // Verify enrollment exists
  const enrollment = await verifyEnrollment(enrollmentId, req.tenantId);

  // Check if payment record already exists
  const existing = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (existing) {
    throw new ApiError(
      409,
      "A payment record already exists for this enrollment — use PUT to update it"
    );
  }

  const payment = await Payment.create({
    tenantId: req.tenantId,
    enrollmentId,
    candidateId: enrollment.candidateId._id,
    totalFeeCharged: totalFeeCharged ?? 0,
    paymentDeadline: paymentDeadline || null,
    transactions: [],
    expenses: [],
  });

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_PAYMENT",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} created payment record for ${enrollment.candidateId.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      { ...payment.toObject(), ...summary },
      "Payment record created successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/payments/:enrollmentId
// @access  All roles
// @desc    Get payment record for an enrollment
//          Includes calculated summary fields
// ─────────────────────────────────────────
const getPayment = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const filter = {
    tenantId: req.tenantId,
    enrollmentId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const payment = await Payment.findOne(filter)
    .populate("candidateId", "fullName mobile email")
    .populate("transactions.recordedBy", "name")
    .populate("expenses.recordedBy", "name");

  if (!payment) {
    throw new ApiError(
      404,
      "No payment record found for this enrollment — create one first"
    );
  }

  const summary = calculatePaymentSummary(payment);

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...payment.toObject(), ...summary },
      "Payment fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/payments/:enrollmentId
// @access  Root, Admin, Staff
// @desc    Update total fee charged and/or deadline
// ─────────────────────────────────────────
const updatePayment = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { totalFeeCharged, paymentDeadline } = req.body;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(404, "Payment record not found");
  }

  const updates = {};
  if (totalFeeCharged !== undefined) updates.totalFeeCharged = totalFeeCharged;
  if (paymentDeadline !== undefined) updates.paymentDeadline = paymentDeadline || null;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedPayment = await Payment.findByIdAndUpdate(
    payment._id,
    { $set: updates },
    { new: true }
  )
    .populate("candidateId", "fullName mobile email")
    .populate("transactions.recordedBy", "name")
    .populate("expenses.recordedBy", "name");

  const summary = calculatePaymentSummary(updatedPayment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_PAYMENT",
    entityType: "payment",
    entityId: updatedPayment._id,
    description: `${req.user.name} updated payment details`,
    metadata: { updates },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...updatedPayment.toObject(), ...summary },
      "Payment updated successfully"
    )
  );
});

// ═════════════════════════════════════════
// TRANSACTION MANAGEMENT
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// @route   POST /api/payments/:enrollmentId/transactions
// @access  Root, Admin, Staff
// @desc    Add a payment transaction (installment)
// ─────────────────────────────────────────
const addTransaction = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { amount, date, paidTo, note } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(400, "Valid transaction amount is required");
  }

  if (!date) {
    throw new ApiError(400, "Transaction date is required");
  }

  if (!paidTo || !["institute", "us"].includes(paidTo)) {
    throw new ApiError(400, "paidTo must be either 'institute' or 'us'");
  }

  const enrollment = await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(
      404,
      "Payment record not found — create one first"
    );
  }

  payment.transactions.push({
    amount,
    date,
    paidTo,
    note: note?.trim() || null,
    recordedBy: req.user._id,
  });

  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ADD_TRANSACTION",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} recorded payment of ₹${amount} for ${enrollment.candidateId.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      { ...payment.toObject(), ...summary },
      "Transaction added successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/payments/:enrollmentId/transactions/:transactionId
// @access  Root, Admin, Staff
// @desc    Update a transaction
// ─────────────────────────────────────────
const updateTransaction = asyncHandler(async (req, res) => {
  const { enrollmentId, transactionId } = req.params;
  const { amount, date, paidTo, note } = req.body;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) throw new ApiError(404, "Payment record not found");

  const transaction = payment.transactions.id(transactionId);
  if (!transaction) throw new ApiError(404, "Transaction not found");

  if (amount !== undefined) {
    if (amount <= 0) throw new ApiError(400, "Amount must be greater than 0");
    transaction.amount = amount;
  }
  if (date !== undefined) transaction.date = date;
  if (paidTo !== undefined) {
    if (!["institute", "us"].includes(paidTo)) {
      throw new ApiError(400, "paidTo must be 'institute' or 'us'");
    }
    transaction.paidTo = paidTo;
  }
  if (note !== undefined) transaction.note = note?.trim() || null;

  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_TRANSACTION",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} updated a transaction`,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...payment.toObject(), ...summary },
      "Transaction updated successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/payments/:enrollmentId/transactions/:transactionId
// @access  Root, Admin, Staff
// @desc    Remove a transaction
// ─────────────────────────────────────────
const deleteTransaction = asyncHandler(async (req, res) => {
  const { enrollmentId, transactionId } = req.params;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) throw new ApiError(404, "Payment record not found");

  const transactionIndex = payment.transactions.findIndex(
    (t) => t._id.toString() === transactionId
  );

  if (transactionIndex === -1) throw new ApiError(404, "Transaction not found");

  payment.transactions.splice(transactionIndex, 1);
  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_TRANSACTION",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} removed a transaction`,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...payment.toObject(), ...summary },
      "Transaction removed successfully"
    )
  );
});

// ═════════════════════════════════════════
// EXPENSE MANAGEMENT
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// @route   POST /api/payments/:enrollmentId/expenses
// @access  Root, Admin, Staff
// @desc    Add an expense record
// ─────────────────────────────────────────
const addExpense = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { amount, date, category, note } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(400, "Valid expense amount is required");
  }

  if (!date) {
    throw new ApiError(400, "Expense date is required");
  }

  const validCategories = ["document", "shipping", "courier", "other"];
  if (!category || !validCategories.includes(category)) {
    throw new ApiError(
      400,
      `Invalid category — must be one of: ${validCategories.join(", ")}`
    );
  }

  const enrollment = await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(404, "Payment record not found — create one first");
  }

  payment.expenses.push({
    amount,
    date,
    category,
    note: note?.trim() || null,
    recordedBy: req.user._id,
  });

  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ADD_EXPENSE",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} recorded expense of ₹${amount} (${category}) for ${enrollment.candidateId.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      { ...payment.toObject(), ...summary },
      "Expense added successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/payments/:enrollmentId/expenses/:expenseId
// @access  Root, Admin, Staff
// @desc    Update an expense record
// ─────────────────────────────────────────
const updateExpense = asyncHandler(async (req, res) => {
  const { enrollmentId, expenseId } = req.params;
  const { amount, date, category, note } = req.body;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) throw new ApiError(404, "Payment record not found");

  const expense = payment.expenses.id(expenseId);
  if (!expense) throw new ApiError(404, "Expense not found");

  if (amount !== undefined) {
    if (amount <= 0) throw new ApiError(400, "Amount must be greater than 0");
    expense.amount = amount;
  }
  if (date !== undefined) expense.date = date;
  if (category !== undefined) {
    const validCategories = ["document", "shipping", "courier", "other"];
    if (!validCategories.includes(category)) {
      throw new ApiError(
        400,
        `Invalid category — must be one of: ${validCategories.join(", ")}`
      );
    }
    expense.category = category;
  }
  if (note !== undefined) expense.note = note?.trim() || null;

  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_EXPENSE",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} updated an expense record`,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...payment.toObject(), ...summary },
      "Expense updated successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/payments/:enrollmentId/expenses/:expenseId
// @access  Root, Admin, Staff
// @desc    Remove an expense record
// ─────────────────────────────────────────
const deleteExpense = asyncHandler(async (req, res) => {
  const { enrollmentId, expenseId } = req.params;

  await verifyEnrollment(enrollmentId, req.tenantId);

  const payment = await Payment.findOne({
    tenantId: req.tenantId,
    enrollmentId,
    isDeleted: false,
  });

  if (!payment) throw new ApiError(404, "Payment record not found");

  const expenseIndex = payment.expenses.findIndex(
    (e) => e._id.toString() === expenseId
  );

  if (expenseIndex === -1) throw new ApiError(404, "Expense not found");

  payment.expenses.splice(expenseIndex, 1);
  await payment.save();

  await payment.populate("transactions.recordedBy", "name");
  await payment.populate("expenses.recordedBy", "name");
  await payment.populate("candidateId", "fullName mobile email");

  const summary = calculatePaymentSummary(payment);

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_EXPENSE",
    entityType: "payment",
    entityId: payment._id,
    description: `${req.user.name} removed an expense record`,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...payment.toObject(), ...summary },
      "Expense removed successfully"
    )
  );
});

export {
  createPayment,
  getPayment,
  updatePayment,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addExpense,
  updateExpense,
  deleteExpense,
};