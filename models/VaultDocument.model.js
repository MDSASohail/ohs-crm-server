import mongoose from 'mongoose';

const vaultDocumentSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
        },

        // Original uploaded filename (shown in UI)
        name: {
            type: String,
            required: true,
            trim: true,
        },

        // Tags — predefined + custom
        tags: {
            type: [String],
            default: [],
        },

        // Optional note per document
        note: {
            type: String,
            default: '',
            trim: true,
        },

        // File metadata
        fileUrl: {
            type: String,
            required: true,
        },

        fileName: {
            type: String, // original disk filename (for serving/deleting)
            required: true,
        },

        fileType: {
            type: String, // MIME type e.g. application/pdf
            required: true,
        },

        fileSize: {
            type: Number, // bytes
            required: true,
        },

        storageProvider: {
            type: String,
            enum: ['local', 'cloudinary', 's3'],
            default: 'local',
        },

        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        resourceType: {
            type: String,
            enum: ['image', 'raw'],
            default: 'raw',
        },

        // Soft delete — standard pattern
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for fast tenant-scoped queries
vaultDocumentSchema.index({ tenantId: 1, isDeleted: 1 });
vaultDocumentSchema.index({ tenantId: 1, tags: 1 });

export const VaultDocument = mongoose.model('VaultDocument', vaultDocumentSchema);