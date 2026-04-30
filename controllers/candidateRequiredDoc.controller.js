import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logActivity } from '../utils/activityLogger.js';
import { CandidateRequiredDoc } from '../models/CandidateRequiredDoc.model.js';
import Candidate from '../models/Candidate.model.js';
import cloudinary from '../config/cloudinary.js';

// ─── Helper — verify candidate belongs to tenant ──────────────────────────────
const verifyCandidate = async (candidateId, tenantId) => {
  const candidate = await Candidate.findOne({
    _id: candidateId,
    tenantId,
    isDeleted: false,
  });
  if (!candidate) throw new ApiError(404, 'Candidate not found');
  return candidate;
};

// ─── GET all required doc slots for a candidate ───────────────────────────────
export const getCandidateRequiredDocs = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { candidateId } = req.params;

  await verifyCandidate(candidateId, tenantId);

  const docs = await CandidateRequiredDoc.find({
    tenantId,
    candidateId,
    isDeleted: false,
  })
    .populate('courseId', 'name shortCode')
    .populate('enrollmentId', 'status')
    .populate('files.uploadedBy', 'name')
    .sort({ order: 1 });

  return res.status(200).json(new ApiResponse(200, docs, 'Required docs fetched'));
});

// ─── UPLOAD a file to a slot ──────────────────────────────────────────────────
export const uploadFileToSlot = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { candidateId, docId } = req.params;

  if (!req.file) throw new ApiError(400, 'No file uploaded');

  const doc = await CandidateRequiredDoc.findOne({
    _id: docId,
    tenantId,
    candidateId,
    isDeleted: false,
  });
  if (!doc) throw new ApiError(404, 'Required doc slot not found');

  const name = req.body.name?.trim() || req.file.originalname;

  // Cloudinary: req.file.path = secure_url, req.file.filename = public_id
  doc.files.push({
    name,
    fileUrl: req.file.path,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    cloudinaryPublicId: req.file.filename,
    storageProvider: 'cloudinary',
    uploadedBy: req.user._id,
    uploadedAt: new Date(),
  });

  await doc.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'UPLOAD_REQUIRED_DOC_FILE',
    entityType: 'CandidateRequiredDoc',
    entityId: doc._id,
    description: `${req.user.name} uploaded file "${name}" to required doc slot "${doc.slotLabel}"`,
  });

  const updated = await CandidateRequiredDoc.findById(doc._id)
    .populate('courseId', 'name shortCode')
    .populate('enrollmentId', 'status')
    .populate('files.uploadedBy', 'name');

  return res.status(201).json(new ApiResponse(201, updated, 'File uploaded'));
});

// ─── RENAME a file ────────────────────────────────────────────────────────────
export const renameFile = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { candidateId, docId, fileId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) throw new ApiError(400, 'New name is required');

  const doc = await CandidateRequiredDoc.findOne({
    _id: docId,
    tenantId,
    candidateId,
    isDeleted: false,
  });
  if (!doc) throw new ApiError(404, 'Required doc slot not found');

  const file = doc.files.id(fileId);
  if (!file) throw new ApiError(404, 'File not found');

  file.name = name.trim();
  await doc.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'RENAME_REQUIRED_DOC_FILE',
    entityType: 'CandidateRequiredDoc',
    entityId: doc._id,
    description: `${req.user.name} renamed file to "${name.trim()}" in slot "${doc.slotLabel}"`,
  });

  const updated = await CandidateRequiredDoc.findById(doc._id)
    .populate('courseId', 'name shortCode')
    .populate('enrollmentId', 'status')
    .populate('files.uploadedBy', 'name');

  return res.status(200).json(new ApiResponse(200, updated, 'File renamed'));
});

// ─── DELETE a file from a slot ────────────────────────────────────────────────
export const deleteFile = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { candidateId, docId, fileId } = req.params;

  const doc = await CandidateRequiredDoc.findOne({
    _id: docId,
    tenantId,
    candidateId,
    isDeleted: false,
  });
  if (!doc) throw new ApiError(404, 'Required doc slot not found');

  const file = doc.files.id(fileId);
  if (!file) throw new ApiError(404, 'File not found');

  const fileName = file.name;

  // Delete from Cloudinary
  if (file.storageProvider === 'cloudinary' && file.cloudinaryPublicId) {
    try {
      const isImage = file.fileType?.startsWith('image/');
      await cloudinary.uploader.destroy(file.cloudinaryPublicId, {
        resource_type: isImage ? 'image' : 'raw',
      });
    } catch (err) {
      // Non-fatal — log and continue
      console.error('Cloudinary delete failed:', err.message);
    }
  }

  file.deleteOne();
  await doc.save();

  await logActivity({
    tenantId,
    userId: req.user._id,
    action: 'DELETE_REQUIRED_DOC_FILE',
    entityType: 'CandidateRequiredDoc',
    entityId: doc._id,
    description: `${req.user.name} deleted file "${fileName}" from slot "${doc.slotLabel}"`,
  });

  const updated = await CandidateRequiredDoc.findById(doc._id)
    .populate('courseId', 'name shortCode')
    .populate('enrollmentId', 'status')
    .populate('files.uploadedBy', 'name');

  return res.status(200).json(new ApiResponse(200, updated, 'File deleted'));
});