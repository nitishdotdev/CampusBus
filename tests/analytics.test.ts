import { describe, it, expect, beforeAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';

describe('getAnalytics (file-backed development store)', () => {
  let db: any;
  let collegeId = '';
  beforeAll(async () => {
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'cm-analytics-')));
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    const mod = await import('../server/db');
    await mod.initDatabase();
    db = mod.db;
    collegeId = (await db.getColleges())[0].id;
  });

  it('reports only values derived from stored records', async () => {
    const [buses, routes, trips] = await Promise.all([db.getBuses(collegeId), db.getRoutes(collegeId), db.getTrips(collegeId)]);
    const a = await db.getAnalytics(collegeId);
    expect(a.fleetSize).toBe(buses.length);
    expect(a.routesCount).toBe(routes.length);
    const dist = trips.reduce((s: number, t: any) => s + (t.distance_covered_km || 0), 0);
    expect(a.totalDistanceCoveredKm).toBeCloseTo(dist, 1);
  });

  it('marks unmeasured metrics as null instead of inventing numbers', async () => {
    const a = await db.getAnalytics(collegeId);
    expect(a.onTimeRatePercent).toBeNull();
    expect(a.gpsReliabilityPercent).toBeNull();
    expect(a.totalPassengers).toBeNull();
    expect(a).not.toHaveProperty('totalPassengersEstimated');
  });

  it('counts only trips completed today in completedTripsToday', async () => {
    const old = new Date(Date.now() - 3 * 86400_000).toISOString();
    const bus = (await db.getBuses(collegeId))[0];
    const route = (await db.getRoutes(collegeId))[0];
    const before = await db.getAnalytics(collegeId);
    await db.createTrip({
      id: 'trip_old_analytics_test', college_id: collegeId, bus_id: bus.id, route_id: route.id, driver_id: 'd',
      status: 'COMPLETED', start_time: old, end_time: old, current_occupancy: 0, max_occupancy_recorded: 0,
      distance_covered_km: 0, total_locations_logged: 0, synced_locations_count: 0, queued_locations_count: 0, created_at: old,
    });
    const after = await db.getAnalytics(collegeId);
    expect(after.completedTripsTotal).toBe(before.completedTripsTotal + 1);
    expect(after.completedTripsToday).toBe(before.completedTripsToday);
  });
});
