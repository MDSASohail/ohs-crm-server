import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logActivity } from '../utils/activityLogger.js';
import { RequiredDocumentTemplate } from '../models/RequiredDocumentTemplate.model.js';
import Course  from '../models/Course.model.js';


// ─── GET template for a course ───────────────────────────────────────────────
export const getTemplate = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { courseId } = req.params;

  // Verify course belongs to tenant
  const course = await Course.findOne({ _id: courseId, tenantId, isDeleted: false });
  if (!course) throw new ApiError(404, 'Course not found');

  let template = await RequiredDocumentTemplate.findOne({
    tenantId,
    courseId,
    isDeleted: false,
  });

  // Return empty template shape if none exists yet
  if (!template) {
    return res.status(200).json(
      new ApiResponse(200, { courseId, slots: [], version: 0 }, 'No template yet')
    );
  }

  return res.status(200).json(new ApiResponse(200, template, 'Template fetched'));
});

// ─── ADD a slot ──────────────────────────────────────────────────────────────
export const addSlot = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { courseId } = req.params;
  const { label, helperText, isRequired } = req.body;

  if (!label || !label.trim()) throw new ApiError(400, 'Slot label is required');

  const course = await Course.findOne({ _id: courseId, tenantId, isDeleted: false });
  if (!course) throw new ApiError(404, 'Course not found');

  let template = await RequiredDocumentTemplate.findOne({
    tenantId,
    courseId,
    isDeleted: false,
  });

  if (!template) {
    template = await RequiredDocumentTemplate.create({
      tenantId,
      courseId,
      slots: [],
      version: 1,
    });
  }

  const order = template.slots.length; // append at end

  template.slots.push({
    label: label.trim(),
    helperText: helperText?.trim() || '',
    isRequired: isRequired !== undefined ? isRequired : true,
    order,
  });

  template.version += 1;
  await template.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'ADD_REQUIRED_DOC_SLOT',
    entityType: 'RequiredDocumentTemplate',
    entityId: template._id,
    description: `${req.user.name} added required document slot "${label.trim()}" to course "${course.name}"`,
  });

  return res.status(201).json(new ApiResponse(201, template, 'Slot added'));
});

// ─── EDIT a slot ─────────────────────────────────────────────────────────────
export const editSlot = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { courseId, slotId } = req.params;
  const { label, helperText, isRequired } = req.body;

  if (!label || !label.trim()) throw new ApiError(400, 'Slot label is required');

  const template = await RequiredDocumentTemplate.findOne({
    tenantId,
    courseId,
    isDeleted: false,
  });
  if (!template) throw new ApiError(404, 'Template not found');

  const slot = template.slots.id(slotId);
  if (!slot) throw new ApiError(404, 'Slot not found');

  slot.label = label.trim();
  slot.helperText = helperText?.trim() ?? slot.helperText;
  if (isRequired !== undefined) slot.isRequired = isRequired;

  template.version += 1;
  await template.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'EDIT_REQUIRED_DOC_SLOT',
    entityType: 'RequiredDocumentTemplate',
    entityId: template._id,
    description: `${req.user.name} edited required document slot "${slot.label}" on course`,
  });

  return res.status(200).json(new ApiResponse(200, template, 'Slot updated'));
});

// ─── DELETE a slot ───────────────────────────────────────────────────────────
export const deleteSlot = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { courseId, slotId } = req.params;

  const template = await RequiredDocumentTemplate.findOne({
    tenantId,
    courseId,
    isDeleted: false,
  });
  if (!template) throw new ApiError(404, 'Template not found');

  const slot = template.slots.id(slotId);
  if (!slot) throw new ApiError(404, 'Slot not found');

  const slotLabel = slot.label;
  slot.deleteOne();

  // Re-index order after deletion
  template.slots.forEach((s, i) => { s.order = i; });
  template.version += 1;
  await template.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'DELETE_REQUIRED_DOC_SLOT',
    entityType: 'RequiredDocumentTemplate',
    entityId: template._id,
    description: `${req.user.name} deleted required document slot "${slotLabel}" from course`,
  });

  return res.status(200).json(new ApiResponse(200, template, 'Slot deleted'));
});

// ─── REORDER slots ───────────────────────────────────────────────────────────
export const reorderSlots = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { courseId } = req.params;
  const { orderedIds } = req.body; // array of slotIds in new order

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ApiError(400, 'orderedIds array is required');
  }

  const template = await RequiredDocumentTemplate.findOne({
    tenantId,
    courseId,
    isDeleted: false,
  });
  if (!template) throw new ApiError(404, 'Template not found');

  orderedIds.forEach((id, index) => {
    const slot = template.slots.id(id);
    if (slot) slot.order = index;
  });

  template.slots.sort((a, b) => a.order - b.order);
  template.version += 1;
  await template.save();

  return res.status(200).json(new ApiResponse(200, template, 'Slots reordered'));
});