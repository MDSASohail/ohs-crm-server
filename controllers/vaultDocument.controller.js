import fs from 'fs';
import path from 'path';
import { VaultDocument } from '../models/VaultDocument.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logActivity } from '../utils/activityLogger.js';
import cloudinary from '../config/cloudinary.js';

// ─── Helper: build file URL from stored filename ─────────────────────────────
// ─── Helper: build file URL from Cloudinary upload result ────────────────────
const buildFileUrl = (req) => req.file.path; // Cloudinary returns secure_url as file.path

// ─── Helper: delete file from Cloudinary ─────────────────────────────────────
const deleteCloudinaryFile = async (publicId, resourceType = 'raw') => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch {
        console.error(`Failed to delete vault file from Cloudinary: ${publicId}`);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vault-documents
// Query params: search, tags (comma-separated), page, limit
// ─────────────────────────────────────────────────────────────────────────────
export const getVaultDocuments = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    const { search, tags, page = 1, limit = 20 } = req.query;

    const filter = { tenantId, isDeleted: false };

    // Name search
    if (search && search.trim()) {
        filter.name = { $regex: search.trim(), $options: 'i' };
    }

    // Tag filter — comma-separated e.g. ?tags=IGC,Diploma
    if (tags && tags.trim()) {
        const tagArray = tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        if (tagArray.length > 0) {
            filter.tags = { $in: tagArray };
        }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [documents, total] = await Promise.all([
        VaultDocument.find(filter)
            .populate('uploadedBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit)),
        VaultDocument.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                documents,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / Number(limit)),
                },
            },
            'Vault documents fetched'
        )
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vault-documents/upload
// multipart/form-data — fields: name (optional), tags (JSON array), note
// ─────────────────────────────────────────────────────────────────────────────
export const uploadVaultDocument = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;

    if (!req.file) throw new ApiError(400, 'No file uploaded');

    // name defaults to the original filename (without extension noise)
    const name =
        req.body.name && req.body.name.trim()
            ? req.body.name.trim()
            : req.file.originalname;

    // tags sent as JSON string from frontend e.g. '["IGC","Diploma"]'
    let tags = [];
    if (req.body.tags) {
        try {
            tags = JSON.parse(req.body.tags);
            if (!Array.isArray(tags)) tags = [];
        } catch {
            tags = [];
        }
    }

    const note = req.body.note ? req.body.note.trim() : '';
    const isImage = req.file.mimetype.startsWith('image/');
    const isPdf = req.file.mimetype === 'application/pdf';
    const resourceType = isImage || isPdf ? 'image' : 'raw';

    const document = await VaultDocument.create({
        tenantId,
        name,
        tags,
        note,
        fileUrl: req.file.path,           // Cloudinary secure_url
        fileName: req.file.filename,      // Cloudinary public_id
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        storageProvider: 'cloudinary',
        uploadedBy: req.user._id,
        resourceType,
    });

    await document.populate('uploadedBy', 'name');

    await logActivity({
        tenantId,
        userId: req.user._id,
        action: 'VAULT_DOCUMENT_UPLOAD',
        entityType: 'vaultDocument',
        entityId: document._id,
        description: `${req.user.name} uploaded vault document "${name}"`,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, document, 'Document uploaded successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/vault-documents/:id/rename
// Body: { name }
// ─────────────────────────────────────────────────────────────────────────────
export const renameVaultDocument = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    const { name } = req.body;

    if (!name || !name.trim()) throw new ApiError(400, 'Name is required');

    const document = await VaultDocument.findOne({
        _id: req.params.id,
        tenantId,
        isDeleted: false,
    });
    if (!document) throw new ApiError(404, 'Document not found');

    const oldName = document.name;
    document.name = name.trim();
    await document.save();

    await logActivity({
        tenantId,
        userId: req.user._id,
        action: 'VAULT_DOCUMENT_RENAME',
        entityType: 'vaultDocument',
        entityId: document._id,
        description: `${req.user.name} renamed vault document from "${oldName}" to "${name.trim()}"`,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, document, 'Document renamed successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/vault-documents/:id/tags
// Body: { tags: string[] }
// ─────────────────────────────────────────────────────────────────────────────
export const updateVaultDocumentTags = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    let { tags } = req.body;

    if (!Array.isArray(tags)) throw new ApiError(400, 'tags must be an array');

    const document = await VaultDocument.findOne({
        _id: req.params.id,
        tenantId,
        isDeleted: false,
    });
    if (!document) throw new ApiError(404, 'Document not found');

    document.tags = tags.map((t) => t.trim()).filter(Boolean);
    await document.save();

    await logActivity({
        tenantId,
        userId: req.user._id,
        action: 'VAULT_DOCUMENT_TAG',
        entityType: 'vaultDocument',
        entityId: document._id,
        description: `${req.user.name} updated tags on vault document "${document.name}"`,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, document, 'Tags updated successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/vault-documents/:id/note
// Body: { note }
// ─────────────────────────────────────────────────────────────────────────────
export const updateVaultDocumentNote = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    const { note } = req.body;

    const document = await VaultDocument.findOne({
        _id: req.params.id,
        tenantId,
        isDeleted: false,
    });
    if (!document) throw new ApiError(404, 'Document not found');

    document.note = note ? note.trim() : '';
    await document.save();

    await logActivity({
        tenantId,
        userId: req.user._id,
        action: 'VAULT_DOCUMENT_NOTE',
        entityType: 'vaultDocument',
        entityId: document._id,
        description: `${req.user.name} updated note on vault document "${document.name}"`,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, document, 'Note updated successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/vault-documents/:id
// Soft delete — file stays on disk, record hidden from all queries
// ─────────────────────────────────────────────────────────────────────────────
export const deleteVaultDocument = asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;

    const document = await VaultDocument.findOne({
        _id: req.params.id,
        tenantId,
        isDeleted: false,
    });
    if (!document) throw new ApiError(404, 'Document not found');

    document.isDeleted = true;
    document.deletedAt = new Date();
    document.deletedBy = req.user._id;
    await document.save();

    // Also remove from disk to free space (optional — comment out if you want recovery)
    await deleteCloudinaryFile(document.fileName, document.resourceType || 'raw');

    await logActivity({
        tenantId,
        userId: req.user._id,
        action: 'VAULT_DOCUMENT_DELETE',
        entityType: 'vaultDocument',
        entityId: document._id,
        description: `${req.user.name} deleted vault document "${document.name}"`,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, null, 'Document deleted successfully'));
});