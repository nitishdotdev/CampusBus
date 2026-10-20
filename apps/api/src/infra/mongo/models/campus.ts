import { Schema } from 'mongoose';

export interface CampusDoc {
  _id: unknown;
  name: string;
  shortCode: string;  // e.g. 'ASU', 'NIT'
  city: string;
  lat: number;
  lng: number;
  zoom: number;
  timezone: string;
  createdAt: Date;
}

export const campusSchema = new Schema<CampusDoc>({
  name:      { type: String, required: true, minlength: 2, maxlength: 120 },
  shortCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 16, unique: true },
  city:      { type: String, default: '' },
  lat:       { type: Number, required: true },
  lng:       { type: Number, required: true },
  zoom:      { type: Number, default: 15 },
  timezone:  { type: String, default: 'UTC' },
  createdAt: { type: Date, default: Date.now },
});
