import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    helperText: {
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
  },
  { _id: true }
);

const requiredDocumentTemplateSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    slots: [slotSchema],
    version: {
      type: Number,
      default: 1,
    },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One template per course per tenant
requiredDocumentTemplateSchema.index({ tenantId: 1, courseId: 1 }, { unique: true });

export const RequiredDocumentTemplate = mongoose.model(
  'RequiredDocumentTemplate',
  requiredDocumentTemplateSchema
);