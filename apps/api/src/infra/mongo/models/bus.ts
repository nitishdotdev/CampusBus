import { Schema } from 'mongoose';

export const busSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  number: { type: String, required: true, trim: true, maxlength: 32 },
  capacity: { type: Number, required: true, min: 1, max: 200, validate: Number.isInteger },
  status: { type: String, enum: ['ACTIVE', 'MAINTENANCE', 'OFFLINE'], required: true, default: 'ACTIVE' },
  driverId: { type: Schema.Types.ObjectId },
  routeId: { type: Schema.Types.ObjectId },
}, { timestamps: true });
busSchema.index({ campusId: 1, number: 1 }, { unique: true });
// A driver drives at most one bus. Sparse: buses without a driver do not collide.
busSchema.index({ driverId: 1 }, { unique: true, sparse: true });
busSchema.index({ campusId: 1, routeId: 1 });
