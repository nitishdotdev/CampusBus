import { Schema } from 'mongoose';

export const scheduleSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  routeId: { type: Schema.Types.ObjectId, required: true },
  busId: { type: Schema.Types.ObjectId, required: true },
  direction: { type: String, enum: ['TO_CAMPUS', 'FROM_CAMPUS'], required: true },
  daysOfWeek: { type: [Number], required: true, validate: (d: number[]) => d.length > 0 && d.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) },
  departTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  active: { type: Boolean, default: true },
}, { timestamps: true });
scheduleSchema.index({ campusId: 1, routeId: 1, departTime: 1 });
scheduleSchema.index({ campusId: 1, busId: 1 });
