import { Schema } from 'mongoose';

export const emailTokenSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, required: true },
  campusId:  { type: Schema.Types.ObjectId, required: true },
  purpose:   { type: String, enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'], required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt:    { type: Date, default: null },
}, { timestamps: false });
emailTokenSchema.index({ tokenHash: 1, purpose: 1 }, { unique: true });
emailTokenSchema.index({ userId: 1, purpose: 1 });
emailTokenSchema.index({ expiresAt: 1 });
