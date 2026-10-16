import { Schema } from 'mongoose';
import { pointSchema } from './shared';

/** Latest known position, one document per bus. History lives in `telemetry`. */
export const vehicleLocationSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  busId: { type: Schema.Types.ObjectId, required: true },
  tripId: { type: Schema.Types.ObjectId, required: true },
  location: { type: pointSchema, required: true },
  accuracyM: { type: Number, default: null },
  speedMps: { type: Number, default: null },
  speedSource: { type: String, enum: ['device', 'derived', 'unavailable'], required: true },
  headingDeg: { type: Number, default: null },
  capturedAt: { type: Date, required: true },
  receivedAt: { type: Date, required: true },
  mode: { type: String, enum: ['REAL', 'SIMULATED'], required: true },
}, { timestamps: false });
vehicleLocationSchema.index({ busId: 1 }, { unique: true });
vehicleLocationSchema.index({ campusId: 1 });
