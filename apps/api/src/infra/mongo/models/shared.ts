import { Schema } from 'mongoose';

export const pointSchema = new Schema({
  type: { type: String, enum: ['Point'], required: true, default: 'Point' },
  coordinates: {
    type: [Number], required: true,
    validate: {
      validator: (c: number[]) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
        && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
      message: 'coordinates must be [lng, lat] within valid bounds',
    },
  },
}, { _id: false });

export const toPoint = (p: { lat: number; lng: number }) => ({ type: 'Point' as const, coordinates: [p.lng, p.lat] });
export const fromPoint = (p: { coordinates: number[] }) => ({ lat: p.coordinates[1] as number, lng: p.coordinates[0] as number });
