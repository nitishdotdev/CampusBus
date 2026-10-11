import { Schema } from 'mongoose';
import { pointSchema } from './shared';

/** Append-only GPS history. Idempotency key is (tripId, eventId). Retention is enforced by an explicit purge job. */
export const telemetrySchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  tripId: { type: Schema.Types.ObjectId, required: true },
  busId: { type: Schema.Types.ObjectId, required: true },
  driverId: { type: Schema.Types.ObjectId, required: true },
  eventId: { type: String, required: true, match: /^[A-Za-z0-9_-]{8,64}$/ },
  location: { type: pointSchema, required: true },
  accuracyM: { type: Number, default: null },
  speedMps: { type: Number, default: null },
  speedSource: { type: String, enum: ['device', 'derived', 'unavailable'], required: true },
  headingDeg: { type: Number, default: null },
  capturedAt: { type: Date, required: true },
  receivedAt: { type: Date, required: true },
  liveEligible: { type: Boolean, required: true },
  lateSync: { type: Boolean, required: true },
  mode: { type: String, enum: ['REAL', 'SIMULATED'], required: true },
}, { timestamps: false });
telemetrySchema.index({ tripId: 1, eventId: 1 }, { unique: true });
telemetrySchema.index({ tripId: 1, capturedAt: 1 });
telemetrySchema.index({ busId: 1, capturedAt: -1 });
telemetrySchema.index({ receivedAt: 1 });
