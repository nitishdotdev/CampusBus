import { Schema } from 'mongoose';

export const tripSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  busId: { type: Schema.Types.ObjectId, required: true },
  driverId: { type: Schema.Types.ObjectId, required: true },
  routeId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], required: true, default: 'ACTIVE' },
  mode: { type: String, enum: ['REAL', 'SIMULATED'], required: true, default: 'REAL' },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date },
  // Present ONLY while the trip is ACTIVE; removed on end. Unique+sparse gives "one active trip per bus/driver"
  // without partial indexes or transactions, and the start/end operations stay single-document atomic.
  activeBusKey: { type: String },
  activeDriverKey: { type: String },
}, { timestamps: true });
tripSchema.index({ activeBusKey: 1 }, { unique: true, sparse: true });
tripSchema.index({ activeDriverKey: 1 }, { unique: true, sparse: true });
tripSchema.index({ campusId: 1, startedAt: -1 });
tripSchema.index({ driverId: 1, startedAt: -1 });
tripSchema.index({ busId: 1, startedAt: -1 });
