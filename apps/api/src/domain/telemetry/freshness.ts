import type { TripDTO, VehicleLocationDTO } from '../types';

export type Freshness = 'LIVE' | 'STALE' | 'DRIVER_OFFLINE' | 'TRIP_ENDED' | 'UNAVAILABLE';

export const FRESHNESS_THRESHOLDS = {
  /** Up to this position age with an active trip: LIVE (about six missed 3 s updates). */
  liveMs: 20_000,
  /** Up to this age: STALE (show last known position, clearly marked). Beyond it: DRIVER_OFFLINE. */
  staleMs: 120_000,
};

/**
 * The age of a position is measured from min(capturedAt, receivedAt):
 * - receivedAt is set by the server, so a device cannot make a position look fresher than the moment it was received;
 * - capturedAt can only make it look OLDER (a position captured 25 s before it arrived is 25 s old on arrival).
 * Clock-skewed "future" capture times are clamped to the receipt time.
 *
 * - no stored position                          -> UNAVAILABLE
 * - no active trip for the bus                  -> TRIP_ENDED (last position is history, never "live")
 * - active trip, age <= 20 s                    -> LIVE
 * - active trip, 20 s < age <= 120 s            -> STALE
 * - active trip, age > 120 s                    -> DRIVER_OFFLINE
 */
export function computeFreshness(now: Date, loc: VehicleLocationDTO | null, activeTrip: TripDTO | null): { state: Freshness; ageMs: number | null } {
  if (!loc) return { state: 'UNAVAILABLE', ageMs: null };
  const positionTime = Math.min(loc.capturedAt.getTime(), loc.receivedAt.getTime());
  const ageMs = Math.max(0, now.getTime() - positionTime);
  if (!activeTrip || activeTrip.id !== loc.tripId) return { state: 'TRIP_ENDED', ageMs };
  if (ageMs <= FRESHNESS_THRESHOLDS.liveMs) return { state: 'LIVE', ageMs };
  if (ageMs <= FRESHNESS_THRESHOLDS.staleMs) return { state: 'STALE', ageMs };
  return { state: 'DRIVER_OFFLINE', ageMs };
}
