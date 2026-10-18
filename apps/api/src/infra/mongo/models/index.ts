import type { Connection } from 'mongoose';
import { campusSchema } from './campus';
import { busSchema } from './bus';
import { vehicleLocationSchema } from './location';
import { auditEventSchema, emergencyAlertSchema, notificationSchema } from './ops';
import { refreshTokenSchema } from './refresh-token';
import { emailTokenSchema } from './email-token';
import { routeSchema } from './route';
import { scheduleSchema } from './schedule';
import { telemetrySchema } from './telemetry';
import { tripSchema } from './trip';
import { userSchema } from './user';

/** Models are bound to a connection (not the global mongoose) so tests can open, close and reopen connections. */
export function createModels(conn: Connection) {
  return {
    Campus: conn.model('Campus', campusSchema),
    User: conn.model('User', userSchema),
    Bus: conn.model('Bus', busSchema),
    Route: conn.model('Route', routeSchema),
    Schedule: conn.model('Schedule', scheduleSchema),
    Trip: conn.model('Trip', tripSchema),
    VehicleLocation: conn.model('VehicleLocation', vehicleLocationSchema),
    Telemetry: conn.model('Telemetry', telemetrySchema),
    Notification: conn.model('Notification', notificationSchema),
    EmergencyAlert: conn.model('EmergencyAlert', emergencyAlertSchema),
    AuditEvent: conn.model('AuditEvent', auditEventSchema),
  RefreshToken: conn.model('RefreshToken', refreshTokenSchema),
  EmailToken: conn.model('EmailToken', emailTokenSchema),
  };
}
export type Models = ReturnType<typeof createModels>;

/** Creates all declared indexes. Run at deploy/startup; safe to repeat. */
export async function ensureIndexes(models: Models): Promise<void> {
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
}
