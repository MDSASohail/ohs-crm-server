// utils/activityLogger.js
// Reusable utility to write activity log entries.
// Called by controllers after every meaningful action.
//
// Usage:
// await logActivity({
//   tenantId: req.tenantId,
//   userId:   req.user._id,
//   action:   "CREATE_CANDIDATE",
//   entityType: "candidate",
//   entityId: candidate._id,
//   description: `Created candidate ${candidate.fullName}`,
//   metadata: null, // optional before/after snapshot
// });

import ActivityLog from "../models/ActivityLog.model.js";

const logActivity = async ({
  tenantId,
  userId,
  action,
  entityType,
  entityId = null,
  description,
  metadata = null,
}) => {
  try {
    await ActivityLog.create({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      description,
      metadata,
    });
  } catch (error) {
    // Activity logging should never crash the main request.
    // If logging fails, we log the error to console and
    // continue — the actual operation already succeeded.
    console.error("⚠️  Activity log failed:", error.message);
  }
};

export { logActivity };