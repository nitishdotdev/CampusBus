import { Schema } from 'mongoose';

export const refreshTokenSchema = new Schema({
  userId:     { type: Schema.Types.ObjectId, required: true },
  campusId:   { type: Schema.Types.ObjectId, required: true },
  tokenHash:  { type: String, required: true },
  familyId:   { type: String, required: true },
  previousId: { type: String, default: null },
  expiresAt:  { type: Date, required: true },
  revokedAt:  { type: Date, default: null },
}, { timestamps: false });
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ familyId: 1, revokedAt: 1 });
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 });
