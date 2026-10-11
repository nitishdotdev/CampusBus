import { z } from 'zod';
import type { TrackingConfig } from '../../config/env';

/** Envelope: strict, so unexpected top-level fields (isSimulated, busId, driverId, ...) are rejected outright. */
export function buildBatchSchema(cfg: TrackingConfig) {
  return z.object({
    tripId: z.string().regex(/^[a-f0-9]{24}$/i, 'tripId'),
    events: z.array(z.unknown()).min(1).max(cfg.maxEventsPerBatch),
  }).strict();
}

/** Single event. Validated individually so one bad event cannot block a whole offline batch. */
export function buildEventSchema(cfg: TrackingConfig) {
  return z.object({
    eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracyM: z.number().finite().min(0).max(cfg.maxAccuracyM).optional(),
    speedMps: z.number().finite().min(0).max(cfg.maxSpeedMps).optional(),
    headingDeg: z.number().finite().min(0).max(360).optional(),
    capturedAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date'),
  }).strict();
}

export type TelemetryEventInput = z.infer<ReturnType<typeof buildEventSchema>>;

/** Maps a zod failure to a stable machine-readable reason (no internals leaked). */
export function reasonFromZod(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'INVALID_EVENT';
  if (issue.code === 'unrecognized_keys') return 'UNKNOWN_FIELD';
  const field = String(issue.path[0] ?? 'event');
  return `INVALID_${field.toUpperCase()}`;
}
