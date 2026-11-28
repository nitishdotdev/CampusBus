import type { Bus, LocationPoint } from '../../types';
import { activeTrackingFreshness, trackingAge } from '../../../shared/trackingFreshness';
export { LIVE_MAX_AGE_MS, OFFLINE_AFTER_MS } from '../../../shared/trackingFreshness';

/**
 * Pure rules for which bus position the dashboards show. Every source (REST snapshot, socket live event,
 * socket reconnect snapshot) carries the device capture time (`timestamp`, ISO). The fix with the later capture
 * time is authoritative: an older REST response that lands after a newer socket event can never move a bus
 * backwards, and a late socket message cannot either. Nothing here generates coordinates.
 */

/** A live socket fix, tagged with its trip so a fix from an earlier trip is never shown on the current one. */
export type SocketFix = LocationPoint & {
  tripId: string;
  receivedAt: string;
  progress?: { nextStopId: string | null; completedStopIds: string[] };
};

const toMillis = (iso: string): number => Date.parse(iso);

/** Chooses the newer of two timestamped fixes. A tie goes to `incoming` (the socket event is the more recent delivery). */
export function newerFix<T extends { timestamp: string }>(current: T | undefined, incoming: T | undefined): T | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  const currentMs = toMillis(current.timestamp);
  const incomingMs = toMillis(incoming.timestamp);
  if (Number.isNaN(currentMs)) return incoming;
  if (Number.isNaN(incomingMs)) return current;
  return incomingMs >= currentMs ? incoming : current;
}

/**
 * Resolves one bus's displayed position from its REST snapshot and the latest socket fix for it.
 * `clock` is the current time in ms (injected so the age rules are testable).
 */
export function resolveBusPosition(bus: Bus, socketFix: SocketFix | undefined, clock: number): Bus {
  const liveSocket = socketFix && bus.canTrack && bus.activeTripId && socketFix.tripId === bus.activeTripId ? socketFix : undefined;
  const fix = newerFix<LocationPoint>(bus.lastLocation, liveSocket);
  if (!fix) return bus;

  const usingSocket = liveSocket !== undefined && fix === liveSocket;
  const receivedAt = usingSocket ? liveSocket.receivedAt : bus.lastSyncTimestamp;
  const captured = toMillis(fix.timestamp);
  const received = toMillis(receivedAt);
  if (!bus.activeTripId || !Number.isFinite(captured)) return bus;
  const freshness = activeTrackingFreshness(trackingAge(clock, captured, received));
  const fresh = freshness === 'LIVE';
  const offline = freshness === 'DRIVER_OFFLINE';

  return {
    ...bus,
    // Stop progression comes from the same live update as the position, so the two never disagree.
    ...(usingSocket && liveSocket.progress ? {
      nextStopId: liveSocket.progress.nextStopId ?? undefined,
      completedStopIds: liveSocket.progress.completedStopIds,
    } : {}),
    // Keep the last known position visible, labelled stale or offline, rather than dropping the marker.
    lastLocation: fix,
    heading: fix.heading ?? undefined,
    speedKmh: fresh && fix.speed != null ? Math.round(fix.speed * 3.6) : undefined,
    gpsStatus: offline ? 'GPS_UNAVAILABLE' : fresh ? 'GPS_ACTIVE' : 'LOCATION_STALE',
    trackingStatus: freshness,
    networkStatus: fresh ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
    lastSyncTimestamp: receivedAt,
  };
}
