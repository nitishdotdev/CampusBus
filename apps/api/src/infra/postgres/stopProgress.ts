import type pg from 'pg';
import { haversineMeters } from '../../domain/telemetry/geo';
import type { VehicleLocationDTO } from '../../domain/types';

interface PendingStop {
  stop_order: number;
  lat: number;
  lng: number;
  first_fix_at: Date | null;
}

export async function recordStopArrival(client: pg.PoolClient, fix: VehicleLocationDTO) {
  if (fix.accuracyM === null || fix.accuracyM > 65) return;
  const { rows: [stop] } = await client.query<PendingStop>(
    'SELECT stop_order, lat, lng, first_fix_at FROM v1.trip_stops WHERE trip_id = $1 AND arrived_at IS NULL ORDER BY stop_order LIMIT 1',
    [fix.tripId],
  );
  if (!stop) return;
  const configured = Number(process.env.GEOFENCE_RADIUS_METERS);
  const radius = Number.isFinite(configured) && configured > 0 ? configured : 50;
  const distance = haversineMeters(fix.location, stop);
  if (distance > radius && stop.first_fix_at) {
    await client.query('UPDATE v1.trip_stops SET first_fix_at = NULL WHERE trip_id = $1 AND stop_order = $2', [fix.tripId, stop.stop_order]);
  } else if (distance <= radius) {
    const dwellMs = stop.first_fix_at ? fix.capturedAt.getTime() - stop.first_fix_at.getTime() : 0;
    const confirmed = (fix.accuracyM <= 25 && distance <= radius * 0.7) || (dwellMs >= 2000 && dwellMs <= 30_000);
    await client.query(
      'UPDATE v1.trip_stops SET first_fix_at = $3, arrived_at = $4 WHERE trip_id = $1 AND stop_order = $2',
      [fix.tripId, stop.stop_order, dwellMs > 30_000 ? fix.capturedAt : stop.first_fix_at ?? fix.capturedAt, confirmed ? fix.capturedAt : null],
    );

  }
}
