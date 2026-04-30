import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    storageProvider: {
      type: String,
      enum: ['local', 'cloudinary', 's3'],
      default: 'local',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const candidateRequiredDocSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },

    // Snapshotted from template slot at enrollment time
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    slotLabel: {
      type: String,
      required: true,
      trim: true,
    },
    slotHelperText: {
      type: String,
      default: '',
      trim: true,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },

    files: [fileSchema],

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Indexes for fast lookups
candidateRequiredDocSchema.index({ tenantId: 1, candidateId: 1 });
candidateRequiredDocSchema.index({ tenantId: 1, enrollmentId: 1 });

export const CandidateRequiredDoc = mongoose.model(
  'CandidateRequiredDoc',
  candidateRequiredDocSchema
);