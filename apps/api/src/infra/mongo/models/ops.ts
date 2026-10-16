import { Schema } from 'mongoose';
import { pointSchema } from './shared';

export const notificationSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['ANNOUNCEMENT', 'DELAY', 'ROUTE_CHANGE', 'EMERGENCY'], required: true },
  priority: { type: String, enum: ['NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  routeId: { type: Schema.Types.ObjectId },
  createdBy: { type: Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date },
}, { timestamps: true });
notificationSchema.index({ campusId: 1, createdAt: -1 });
notificationSchema.index({ campusId: 1, routeId: 1, createdAt: -1 });

export const emergencyAlertSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  busId: { type: Schema.Types.ObjectId, required: true },
  tripId: { type: Schema.Types.ObjectId },
  raisedBy: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN' },
  message: { type: String, maxlength: 1000 },
  location: { type: pointSchema },
  acknowledgedBy: { type: Schema.Types.ObjectId }, acknowledgedAt: { type: Date },
  resolvedBy: { type: Schema.Types.ObjectId }, resolvedAt: { type: Date },
}, { timestamps: true });
emergencyAlertSchema.index({ campusId: 1, status: 1, createdAt: -1 });

export const auditEventSchema = new Schema({
  campusId: { type: Schema.Types.ObjectId, required: true },
  actorId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true, maxlength: 80 },
  targetType: { type: String, required: true, maxlength: 40 },
  targetId: { type: String, maxlength: 64 },
  meta: { type: Schema.Types.Mixed },
  ip: { type: String, maxlength: 64 },
  at: { type: Date, required: true, default: () => new Date() },
}, { timestamps: false });
auditEventSchema.index({ campusId: 1, at: -1 });
auditEventSchema.index({ campusId: 1, actorId: 1, at: -1 });
