import { Schema } from 'mongoose';

export const userSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, enum: ['STUDENT', 'DRIVER', 'ADMIN'], required: true },
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'REJECTED', 'DISABLED'], required: true, default: 'PENDING' },
  emailVerifiedAt: { type: Date },
  assignedBusId: { type: Schema.Types.ObjectId },
  assignedRouteId: { type: Schema.Types.ObjectId },
  phone: { type: String, maxlength: 32 },
}, { timestamps: true });
userSchema.index({ campusId: 1, email: 1 }, { unique: true });
userSchema.index({ campusId: 1, role: 1, status: 1 });
