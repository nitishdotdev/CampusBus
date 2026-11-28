import type pg from 'pg';
import { evaluateStop } from '../../domain/telemetry/stopArrival';
import type { StopProgress, VehicleLocationDTO } from '../../domain/types';

const DEFAULT_GEOFENCE_M = 50;

/** Arrival geofence radius. Set by GEOFENCE_RADIUS_METERS; there is no per-stop radius column yet. */
export function geofenceRadiusM(): number {
  const configured = Number(process.env.GEOFENCE_RADIUS_METERS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_GEOFENCE_M;
}

/**
 * Advances the trip's first pending stop from one live fix (inside the caller's transaction) and returns the
 * resulting progression, so the same authoritative state can be broadcast to every dashboard.
 */
export async function recordStopArrival(client: pg.PoolClient, fix: VehicleLocationDTO): Promise<StopProgress> {
  const { rows: [stop] } = await client.query<{ stop_order: number; lat: number; lng: number; first_fix_at: Date | null }>(
    'SELECT stop_order, lat, lng, first_fix_at FROM v1.trip_stops WHERE trip_id = $1 AND arrived_at IS NULL ORDER BY stop_order LIMIT 1 FOR UPDATE',
    [fix.tripId],
  );
  if (stop) {
    const decision = evaluateStop(
      { lat: stop.lat, lng: stop.lng, firstFixAt: stop.first_fix_at, arrivedAt: null },
      { location: fix.location, accuracyM: fix.accuracyM, speedMps: fix.speedMps, capturedAt: fix.capturedAt },
      geofenceRadiusM(),
    );
    if (decision.changed) {
      await client.query(
        'UPDATE v1.trip_stops SET first_fix_at = $3, arrived_at = $4 WHERE trip_id = $1 AND stop_order = $2',
        [fix.tripId, stop.stop_order, decision.firstFixAt, decision.arrivedAt],
      );
    }
  }
  return readStopProgress(client, fix.tripId);
}

export async function readStopProgress(client: pg.PoolClient | pg.Pool, tripId: string): Promise<StopProgress> {
  const { rows } = await client.query<{ stop_id: string; arrived_at: Date | null }>(
    'SELECT stop_id, arrived_at FROM v1.trip_stops WHERE trip_id = $1 ORDER BY stop_order',
    [tripId],
  );
  return {
    nextStopId: rows.find(r => !r.arrived_at)?.stop_id ?? null,
    completedStopIds: rows.filter(r => r.arrived_at).map(r => r.stop_id),
  };
}
