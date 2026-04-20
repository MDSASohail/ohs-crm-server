// models/Payment.model.js
// Tracks all financial activity for an enrollment.
//
// Three main concerns:
// 1. totalFeeCharged — what we are charging the candidate
// 2. transactions    — installment payments received from candidate
// 3. expenses        — money we spent on behalf of the candidate
//
// Calculated fields (done in controller, not stored):
// — totalPaid      = sum of all transaction amounts
// — remainingBalance = totalFeeCharged - totalPaid
// — totalExpenses  = sum of all expense amounts
// — amountSaved    = totalPaid - totalExpenses (our margin)
// — paymentStatus  = "complete" | "partial" | "overdue"
//
// One Payment document per enrollment.

import mongoose from "mongoose";

// ─────────────────────────────────────────
// Sub-schema for a single payment transaction
// Represents one installment received from
// the candidate
// ─────────────────────────────────────────
const transactionSchema = new mongoose.Schema(
  {
    // Amount received in this installment
    amount: {
      type: Number,
      required: [true, "Transaction amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    // Date this payment was received
    date: {
      type: Date,
      required: [true, "Transaction date is required"],
    },

    // Who received this payment —
    // "institute" means candidate paid the institute directly
    // "us" means candidate paid our business
    paidTo: {
      type: String,
      enum: ["institute", "us"],
      required: [true, "paidTo is required"],
    },

    // Optional note about this transaction
    // e.g. "Paid via bank transfer", "Cash received"
    note: {
      type: String,
      trim: true,
      default: null,
    },

    // Which staff member recorded this transaction
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────
// Sub-schema for a single expense
// Represents money spent by our business
// on behalf of the candidate
// e.g. document fees, courier charges
// ─────────────────────────────────────────
const expenseSchema = new mongoose.Schema(
  {
    // Amount spent
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    // Date this expense was incurred
    date: {
      type: Date,
      required: [true, "Expense date is required"],
    },

    // Category of this expense
    // document  — document preparation fees
    // shipping  — postal or delivery charges
    // courier   — courier service charges
    // other     — anything else
    category: {
      type: String,
      enum: ["document", "shipping", "courier", "other"],
      required: [true, "Expense category is required"],
    },

    // Optional note describing the expense
    // e.g. "DHL courier to Kolkata", "Notary fee"
    note: {
      type: String,
      trim: true,
      default: null,
    },

    // Which staff member recorded this expense
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────
// Main payment schema
// ─────────────────────────────────────────
const paymentSchema = new mongoose.Schema(
  {
    // ─────────────────────────────────────────
    // Tenant isolation
    // ─────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "Tenant ID is required"],
      index: true,
    },

    // ─────────────────────────────────────────
    // References
    // enrollmentId — the enrollment this payment
    //   record belongs to (one-to-one)
    // candidateId  — denormalized for faster queries
    //   without always joining through enrollment
    // ─────────────────────────────────────────
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: [true, "Enrollment ID is required"],
    },

    // Denormalized — stored directly for faster
    // payment queries without needing to populate
    // the enrollment first
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: [true, "Candidate ID is required"],
    },

    // ─────────────────────────────────────────
    // Fee configuration
    // ─────────────────────────────────────────

    // Total amount we are charging this candidate
    // for this enrollment — set once, can be updated
    totalFeeCharged: {
      type: Number,
      default: 0,
      min: [0, "Fee cannot be negative"],
    },

    // Deadline by which full payment should be received
    // Used to calculate overdue status
    paymentDeadline: {
      type: Date,
      default: null,
    },

    // ─────────────────────────────────────────
    // Transactions — payments received
    // from the candidate in installments
    // ─────────────────────────────────────────
    transactions: {
      type: [transactionSchema],
      default: [],
    },

    // ─────────────────────────────────────────
    // Expenses — money spent by us on behalf
    // of the candidate
    // ─────────────────────────────────────────
    expenses: {
      type: [expenseSchema],
      default: [],
    },

    // ─────────────────────────────────────────
    // Soft delete fields — required on every model
    // ─────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────

// One payment document per enrollment —
// unique index enforces this at DB level
paymentSchema.index(
  { tenantId: 1, enrollmentId: 1 },
  { unique: true }
);

// Candidate payment history
paymentSchema.index({ tenantId: 1, candidateId: 1 });

// Soft delete filter
paymentSchema.index({ tenantId: 1, isDeleted: 1 });

// Payment deadline — used for overdue detection
// in dashboard and reminders
paymentSchema.index({ tenantId: 1, paymentDeadline: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;