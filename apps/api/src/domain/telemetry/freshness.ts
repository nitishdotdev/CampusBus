import type { TripDTO, VehicleLocationDTO } from '../types';

export type Freshness = 'LIVE' | 'STALE' | 'DRIVER_OFFLINE' | 'TRIP_ENDED' | 'UNAVAILABLE';

import { activeTrackingFreshness, LIVE_MAX_AGE_MS, OFFLINE_AFTER_MS, trackingAge } from '../../../../../shared/trackingFreshness';

export const FRESHNESS_THRESHOLDS = { liveMs: LIVE_MAX_AGE_MS, staleMs: OFFLINE_AFTER_MS };

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
export function computeFreshness(now: Date, loc: Pick<VehicleLocationDTO, 'tripId' | 'capturedAt' | 'receivedAt'> | null, activeTrip: Pick<TripDTO, 'id'> | null): { state: Freshness; ageMs: number | null } {
  if (!loc) return { state: 'UNAVAILABLE', ageMs: null };
  const ageMs = trackingAge(now.getTime(), loc.capturedAt.getTime(), loc.receivedAt.getTime());
  if (!activeTrip || activeTrip.id !== loc.tripId) return { state: 'TRIP_ENDED', ageMs };
  return { state: activeTrackingFreshness(ageMs), ageMs };
}
