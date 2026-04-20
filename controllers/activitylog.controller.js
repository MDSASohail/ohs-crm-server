// controllers/activitylog.controller.js
// Provides read-only access to the activity log.
// All logging is done automatically by controllers
// via the logActivity() utility — this controller
// only handles reading and filtering those logs.
//
// Routes:
// GET /api/activity-logs              — list logs with filters (root, admin)
// GET /api/activity-logs/:entityType/:entityId — logs for a specific record
//
// Access:
// — Root and Admin can view all logs
// — Staff and Viewer cannot access logs at all
//
// Filters supported:
// ?userId=       — logs by a specific user
// ?action=       — filter by action type
// ?entityType=   — filter by entity type
// ?entityId=     — logs for a specific record
// ?from=         — date range start
// ?to=           — date range end
// ?page=1&limit=50

import ActivityLog from "../models/ActivityLog.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ─────────────────────────────────────────
// @route   GET /api/activity-logs
// @access  Root, Admin
// @desc    List activity logs with filters
//          Newest first by default
// ─────────────────────────────────────────
const getActivityLogs = asyncHandler(async (req, res) => {
  const {
    userId,
    action,
    entityType,
    entityId,
    from,
    to,
    page = 1,
    limit = 50,
  } = req.query;

  const filter = {
    tenantId: req.tenantId,
    isDeleted: false,
  };

  // Filter by user
  if (userId) filter.userId = userId;

  // Filter by action type — supports partial match
  // e.g. ?action=CREATE matches CREATE_CANDIDATE,
  // CREATE_ENROLLMENT, CREATE_PAYMENT etc.
  if (action) {
    filter.action = { $regex: action.toUpperCase(), $options: "i" };
  }

  // Filter by entity type
  if (entityType) {
    const validTypes = [
      "candidate", "enrollment", "payment", "document",
      "reminder", "institute", "course", "user",
      "checklist", "tenant",
    ];
    if (!validTypes.includes(entityType)) {
      throw new ApiError(
        400,
        `Invalid entityType — must be one of: ${validTypes.join(", ")}`
      );
    }
    filter.entityType = entityType;
  }

  // Filter by specific record
  if (entityId) filter.entityId = entityId;

  // Date range filter
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    ActivityLog.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Activity logs fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/activity-logs/:entityType/:entityId
// @access  Root, Admin
// @desc    Get all activity logs for a specific
//          record — e.g. all actions on a candidate,
//          all actions on an enrollment
//          Useful for showing history in detail views
// ─────────────────────────────────────────
const getEntityLogs = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const validTypes = [
    "candidate", "enrollment", "payment", "document",
    "reminder", "institute", "course", "user",
    "checklist", "tenant",
  ];

  if (!validTypes.includes(entityType)) {
    throw new ApiError(
      400,
      `Invalid entityType — must be one of: ${validTypes.join(", ")}`
    );
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const filter = {
    tenantId: req.tenantId,
    entityType,
    entityId,
    isDeleted: false,
  };

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    ActivityLog.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      `Activity logs for ${entityType} fetched successfully`
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/activity-logs/summary
// @access  Root, Admin
// @desc    Returns a summary of recent activity
//          — count of actions per user today
//          — most recent 10 actions across tenant
//          Useful for a quick activity overview
//          on the dashboard or admin panel
// ─────────────────────────────────────────
const getActivitySummary = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [recentLogs, todayByUser] = await Promise.all([
    // Most recent 10 actions across the tenant
    ActivityLog.find({
      tenantId,
      isDeleted: false,
    })
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .limit(10),

    // Count of actions per user today
    ActivityLog.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: "$userId",
          count: { $sum: 1 },
          actions: { $push: "$action" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          userName: "$user.name",
          userEmail: "$user.email",
          count: 1,
          actions: 1,
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        recentLogs,
        todayByUser,
      },
      "Activity summary fetched successfully"
    )
  );
});

export { getActivityLogs, getEntityLogs, getActivitySummary };