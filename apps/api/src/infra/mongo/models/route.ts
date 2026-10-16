import { Schema } from 'mongoose';
import { pointSchema } from './shared';

const stopSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  location: { type: pointSchema, required: true },
  order: { type: Number, required: true, min: 0, validate: Number.isInteger },
});

export const routeSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  code: { type: String, required: true, trim: true, maxlength: 16 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  color: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: '#2563eb' },
  stops: {
    type: [stopSchema], default: [],
    validate: {
      validator: (stops: { order: number }[]) => new Set(stops.map((s) => s.order)).size === stops.length,
      message: 'stop order values must be unique within a route',
    },
  },
}, { timestamps: true });
routeSchema.index({ campusId: 1, code: 1 }, { unique: true });
