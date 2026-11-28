import { haversineMeters } from './geo';

/** Stop decisions are made only from fixes at least this accurate. Same bound as the driver's "low accuracy" warning. */
export const ARRIVAL_MAX_ACCURACY_M = 65;
/** A fix counts as stopped only when its speed is known and at or below this value (about 7 km/h). */
export const STOPPED_SPEED_MPS = 2;
/** A bus must be stopped inside the geofence for at least this long before it is recorded as arrived. */
export const MIN_DWELL_MS = 2_000;

export interface StopState {
  lat: number; lng: number;
  firstFixAt: Date | null;
  arrivedAt: Date | null;
}

export interface StopFix {
  location: { lat: number; lng: number };
  accuracyM: number | null;
  speedMps: number | null;
  capturedAt: Date;
}

export interface StopDecision {
  firstFixAt: Date | null;
  arrivedAt: Date | null;
  changed: boolean;
}

/**
 * Advances one stop's state from one live fix. States:
 * - pending: no approach yet
 * - approaching: stopped inside the geofence, dwell not yet long enough (firstFixAt set)
 * - arrived: stopped inside the geofence for MIN_DWELL_MS on accurate fixes (arrivedAt set)
 * Entering the geofence at speed never counts as arrival. Leaving the geofence, or moving inside it, resets the approach.
 * A fix without a known speed or without enough accuracy decides nothing; no arrival is ever inferred from it.
 */
export function evaluateStop(stop: StopState, fix: StopFix, radiusM: number): StopDecision {
  const unchanged: StopDecision = { firstFixAt: stop.firstFixAt, arrivedAt: stop.arrivedAt, changed: false };
  if (stop.arrivedAt) return unchanged;
  if (fix.accuracyM === null || fix.accuracyM > ARRIVAL_MAX_ACCURACY_M) return unchanged;

  const reset: StopDecision = { firstFixAt: null, arrivedAt: null, changed: stop.firstFixAt !== null };
  const distance = haversineMeters(fix.location, stop);
  if (distance > radiusM) return reset;

  const stopped = fix.speedMps !== null && fix.speedMps <= STOPPED_SPEED_MPS;
  if (!stopped) return reset;

  const firstFixAt = stop.firstFixAt ?? fix.capturedAt;
  const dwellMs = fix.capturedAt.getTime() - firstFixAt.getTime();
  if (dwellMs >= MIN_DWELL_MS) {
    return { firstFixAt, arrivedAt: fix.capturedAt, changed: true };
  }
  return { firstFixAt, arrivedAt: null, changed: stop.firstFixAt === null };
}
