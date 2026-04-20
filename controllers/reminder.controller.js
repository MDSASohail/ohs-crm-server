// controllers/reminder.controller.js
// Handles reminder creation, delivery, and history.
//
// Routes:
// POST   /api/reminders                — create reminder (root, admin, staff)
// GET    /api/reminders                — list reminders with filters (all roles)
// GET    /api/reminders/:id            — get single reminder (all roles)
// POST   /api/reminders/:id/send       — manually send a reminder (root, admin, staff)
// PUT    /api/reminders/:id/cancel     — cancel a pending reminder (root, admin, staff)
// DELETE /api/reminders/:id            — soft delete reminder (root, admin, staff)
//
// Three delivery types:
// internal  — stored in DB, shown as notification in UI
// email     — sent via Nodemailer (Gmail SMTP)
// whatsapp  — sent via WhatsApp Cloud API (Meta)
//
// Reminders can be:
// — sent immediately (send endpoint called right away)
// — scheduled (scheduledAt set, background job sends later)
//   Note: background job scheduling is not built yet —
//   scheduled reminders must be sent manually for now
//   A cron job will be added in a future phase

import Reminder from "../models/Reminder.model.js";
import Candidate from "../models/Candidate.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";
import { sendEmail } from "../utils/email.js";
import { sendWhatsApp } from "../utils/whatsapp.js";

// ─────────────────────────────────────────
// Helper — verify candidate exists in tenant
// ─────────────────────────────────────────
const verifyCandidate = async (candidateId, tenantId) => {
  const candidate = await Candidate.findOne({
    _id: candidateId,
    tenantId,
    isDeleted: false,
  });

  if (!candidate) throw new ApiError(404, "Candidate not found");
  return candidate;
};

// ─────────────────────────────────────────
// Helper — deliver a reminder based on type
// Returns { success, error } object
// Never throws — errors are stored on the reminder
// ─────────────────────────────────────────
const deliverReminder = async (reminder, candidate) => {
  try {
    if (reminder.type === "email") {
      // Candidate must have an email address
      if (!candidate.email) {
        return {
          success: false,
          error: "Candidate has no email address on file",
        };
      }

      await sendEmail({
        to: candidate.email,
        subject: reminder.subject || "Reminder from OHS CRM",
        html: `<div style="font-family: Arial, sans-serif;">
          <p>${reminder.message.replace(/\n/g, "<br>")}</p>
          <br>
          <p style="color: #6B7280; font-size: 12px;">
            This message was sent via OHS CRM
          </p>
        </div>`,
        text: reminder.message,
      });

      return { success: true, error: null };

    } else if (reminder.type === "whatsapp") {
      // Candidate must have a mobile number
      if (!candidate.mobile) {
        return {
          success: false,
          error: "Candidate has no mobile number on file",
        };
      }

      // Prepend country code if not present
      // Default to India (+91) — adjust for your region
      let mobile = candidate.mobile.replace(/[\s\-\+]/g, "");
      if (!mobile.startsWith("91") && mobile.length === 10) {
        mobile = `91${mobile}`;
      }

      await sendWhatsApp({
        to: mobile,
        message: reminder.message,
        type: "text",
      });

      return { success: true, error: null };

    } else if (reminder.type === "internal") {
      // Internal reminders are just stored in DB
      // The frontend polls or receives them via
      // a future notification system
      return { success: true, error: null };
    }

    return { success: false, error: "Unknown reminder type" };

  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────
// @route   POST /api/reminders
// @access  Root, Admin, Staff
// @desc    Create a new reminder
//          If scheduledAt is not provided or is
//          in the past, reminder is created as
//          pending and must be sent manually
// ─────────────────────────────────────────
const createReminder = asyncHandler(async (req, res) => {
  const {
    candidateId,
    enrollmentId,
    type,
    subject,
    message,
    scheduledAt,
  } = req.body;

  // Validate required fields
  if (!candidateId) throw new ApiError(400, "candidateId is required");
  if (!type) throw new ApiError(400, "Reminder type is required");
  if (!message || !message.trim()) {
    throw new ApiError(400, "Reminder message is required");
  }

  const validTypes = ["internal", "email", "whatsapp"];
  if (!validTypes.includes(type)) {
    throw new ApiError(
      400,
      `Invalid type — must be one of: ${validTypes.join(", ")}`
    );
  }

  // Email reminders require a subject
  if (type === "email" && (!subject || !subject.trim())) {
    throw new ApiError(400, "Subject is required for email reminders");
  }

  // Verify candidate exists in this tenant
  await verifyCandidate(candidateId, req.tenantId);

  // Verify enrollment if provided
  if (enrollmentId) {
    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      tenantId: req.tenantId,
      isDeleted: false,
    });
    if (!enrollment) throw new ApiError(404, "Enrollment not found");
  }

  const reminder = await Reminder.create({
    tenantId: req.tenantId,
    candidateId,
    enrollmentId: enrollmentId || null,
    type,
    subject: subject?.trim() || null,
    message: message.trim(),
    scheduledAt: scheduledAt || null,
    status: "pending",
    createdBy: req.user._id,
  });

  await reminder.populate("candidateId", "fullName mobile email");
  await reminder.populate("createdBy", "name email");

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_REMINDER",
    entityType: "reminder",
    entityId: reminder._id,
    description: `${req.user.name} created ${type} reminder for ${reminder.candidateId.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(201, reminder, "Reminder created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/reminders
// @access  All roles
// @desc    List reminders with optional filters
//          ?candidateId=  — reminders for a candidate
//          ?enrollmentId= — reminders for an enrollment
//          ?type=         — filter by type
//          ?status=       — filter by status
//          ?page=1&limit=20
// ─────────────────────────────────────────
const getReminders = asyncHandler(async (req, res) => {
  const {
    candidateId,
    enrollmentId,
    type,
    status,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { tenantId: req.tenantId };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  if (candidateId) filter.candidateId = candidateId;
  if (enrollmentId) filter.enrollmentId = enrollmentId;
  if (type) filter.type = type;
  if (status) filter.status = status;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [reminders, total] = await Promise.all([
    Reminder.find(filter)
      .populate("candidateId", "fullName mobile email")
      .populate("enrollmentId", "status")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Reminder.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        reminders,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Reminders fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/reminders/:id
// @access  All roles
// @desc    Get a single reminder by ID
// ─────────────────────────────────────────
const getReminderById = asyncHandler(async (req, res) => {
  const filter = {
    _id: req.params.id,
    tenantId: req.tenantId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const reminder = await Reminder.findOne(filter)
    .populate("candidateId", "fullName mobile email")
    .populate("enrollmentId", "status courseId")
    .populate("createdBy", "name email");

  if (!reminder) throw new ApiError(404, "Reminder not found");

  return res.status(200).json(
    new ApiResponse(200, reminder, "Reminder fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   POST /api/reminders/:id/send
// @access  Root, Admin, Staff
// @desc    Manually send a reminder immediately
//          Works for pending and failed reminders
//          Updates status to sent or failed
// ─────────────────────────────────────────
const sendReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  }).populate("candidateId", "fullName mobile email");

  if (!reminder) throw new ApiError(404, "Reminder not found");

  // Only pending or failed reminders can be sent
  if (reminder.status === "sent") {
    throw new ApiError(400, "This reminder has already been sent");
  }

  if (reminder.status === "cancelled") {
    throw new ApiError(400, "Cannot send a cancelled reminder");
  }

  // Attempt delivery
  const { success, error } = await deliverReminder(
    reminder,
    reminder.candidateId
  );

  // Update reminder status based on delivery result
  if (success) {
    reminder.status = "sent";
    reminder.sentAt = new Date();
    reminder.failureReason = null;
  } else {
    reminder.status = "failed";
    reminder.failureReason = error;
  }

  await reminder.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: success ? "SEND_REMINDER_SUCCESS" : "SEND_REMINDER_FAILED",
    entityType: "reminder",
    entityId: reminder._id,
    description: success
      ? `${req.user.name} sent ${reminder.type} reminder to ${reminder.candidateId.fullName}`
      : `${req.user.name} failed to send ${reminder.type} reminder to ${reminder.candidateId.fullName} — ${error}`,
  });

  if (!success) {
    throw new ApiError(
      502,
      `Reminder delivery failed — ${error}`
    );
  }

  return res.status(200).json(
    new ApiResponse(200, reminder, "Reminder sent successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/reminders/:id/cancel
// @access  Root, Admin, Staff
// @desc    Cancel a pending reminder
//          Only pending reminders can be cancelled
// ─────────────────────────────────────────
const cancelReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  }).populate("candidateId", "fullName");

  if (!reminder) throw new ApiError(404, "Reminder not found");

  if (reminder.status !== "pending") {
    throw new ApiError(
      400,
      `Cannot cancel a reminder with status: ${reminder.status}`
    );
  }

  reminder.status = "cancelled";
  await reminder.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CANCEL_REMINDER",
    entityType: "reminder",
    entityId: reminder._id,
    description: `${req.user.name} cancelled reminder for ${reminder.candidateId.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, reminder, "Reminder cancelled successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/reminders/:id
// @access  Root, Admin, Staff
// @desc    Soft delete a reminder
// ─────────────────────────────────────────
const deleteReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      },
    },
    { new: true }
  ).populate("candidateId", "fullName");

  if (!reminder) throw new ApiError(404, "Reminder not found");

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_REMINDER",
    entityType: "reminder",
    entityId: reminder._id,
    description: `${req.user.name} deleted reminder for ${reminder.candidateId.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Reminder deleted successfully")
  );
});

export {
  createReminder,
  getReminders,
  getReminderById,
  sendReminder,
  cancelReminder,
  deleteReminder,
};