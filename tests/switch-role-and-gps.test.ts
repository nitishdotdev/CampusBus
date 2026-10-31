import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signToken } from '../server/middleware/auth';
import { db, initDatabase } from '../server/db';
import authRoutes from '../server/routes/auth';
import driverRoutes from '../server/routes/driver';
import tripRoutes from '../server/routes/trips';

describe('role-switch authorization', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use((_req, res) => {
    res.status(200).type('html').send('<!doctype html><html><body>spa</body></html>');
  });

  const studentToken = signToken({
    userId: 'usr_student_alex',
    collegeId: 'college_apex',
    role: 'STUDENT',
    email: 'alex.chen@apex.edu',
    name: 'Alex Chen',
  });

  it('rejects POST /api/auth/switch-role with 403 or 404, never SPA HTML', async () => {
    const res = await request(app)
      .post('/api/auth/switch-role')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ role: 'ADMIN' });

    expect([403, 404]).toContain(res.status);
    expect(String(res.headers['content-type'] || '')).not.toMatch(/html/i);
    expect(res.text).not.toMatch(/<!doctype html>/i);
    expect(res.body.error).toBeTruthy();
  });
});

describe('bus location persistence', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/trips', tripRoutes);
  app.use('/api/driver', driverRoutes);

  beforeAll(async () => {
    await initDatabase();
  });

  const driverToken = signToken({
    userId: 'usr_driver_marcus',
    collegeId: 'college_apex',
    role: 'DRIVER',
    email: 'marcus.vance@transit.apex.edu',
    name: 'Marcus Vance',
  });

  async function liveTripId(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const ended = await request(app).post('/api/trips/end').set('Authorization', `Bearer ${driverToken}`).send({});
      if (ended.status === 404) break;
      if (ended.status !== 200) break;
    }
    const start = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ busId: 'bus_104', routeId: 'route_blue' });
    expect(start.status).toBe(201);
    return start.body.trip.id as string;
  }

  it('persists the first GPS breadcrumb for an assigned driver on an active trip', async () => {
    const tripId = await liveTripId();
    const locationId = 'loc_persist_first_' + Date.now();
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        id: locationId,
        busId: 'bus_104',
        tripId,
        lat: 34.0537,
        lng: -118.2570,
        speed: 7.5,
        heading: 90,
        accuracy: 4.2,
        timestamp: new Date().toISOString(),
        isSimulated: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts a duplicate GPS breadcrumb without 500', async () => {
    const tripId = await liveTripId();
    const locationId = 'loc_persist_dup_' + Date.now();
    const payload = {
      id: locationId,
      busId: 'bus_104',
      tripId,
      lat: 34.0541,
      lng: -118.2572,
      speed: 6.1,
      heading: 88,
      accuracy: 3.8,
      timestamp: new Date().toISOString(),
      isSimulated: false,
    };

    const first = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send(payload);
    expect(first.status).toBe(200);

    const dup = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send(payload);
    expect(dup.status).toBe(200);
  });
});

describe('trip end with duplicate file-store rows', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/trips', tripRoutes);
  app.use('/api/driver', driverRoutes);

  beforeAll(async () => {
    await initDatabase();
  });

  const driverToken = signToken({
    userId: 'usr_driver_marcus',
    collegeId: 'college_apex',
    role: 'DRIVER',
    email: 'marcus.vance@transit.apex.edu',
    name: 'Marcus Vance',
  });

  const elenaToken = signToken({
    userId: 'usr_driver_elena',
    collegeId: 'college_apex',
    role: 'DRIVER',
    email: 'elena.rostova@transit.apex.edu',
    name: 'Elena Rostova',
  });

  function tripFields(overrides: { id: string } & Record<string, unknown>) {
    return {
      college_id: 'college_apex',
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'IN_PROGRESS' as const,
      start_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 0,
      distance_covered_km: 0,
      total_locations_logged: 0,
      synced_locations_count: 0,
      queued_locations_count: 0,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  async function drainDriver(token: string) {
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/trips/end').set('Authorization', `Bearer ${token}`).send({});
      if (res.status === 404) return;
      if (res.status !== 200) return;
    }
  }

  it('POST /api/trips/end without tripId completes duplicate rows of the current trip only', async () => {
    await drainDriver(driverToken);
    const currentId = 'trip_current_' + Date.now();
    const otherId = 'trip_other_distinct_' + Date.now();
    await db.createTrip(tripFields({ id: otherId, start_time: new Date(Date.now() - 60_000).toISOString() }));
    await db.createTrip(tripFields({ id: currentId, start_time: new Date().toISOString() }));
    await db.createTrip(tripFields({ id: currentId, start_time: new Date().toISOString() }));

    const endRes = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(endRes.status).toBe(200);
    expect(endRes.body.trip?.id).toBe(currentId);
    expect(endRes.body.trip?.status).toBe('COMPLETED');

    const leftover = await db.getActiveTripForDriver('usr_driver_marcus', 'college_apex');
    expect(leftover?.id).toBe(otherId);
    expect(leftover?.status).toBe('IN_PROGRESS');
  });

  it('POST /api/trips/end with tripId completes every duplicate row of that id only', async () => {
    const dupId = 'trip_dup_end_' + Date.now();
    const otherId = 'trip_unrelated_' + Date.now();
    await db.createTrip(tripFields({ id: dupId }));
    await db.createTrip(tripFields({ id: dupId }));
    await db.createTrip(tripFields({ id: otherId }));

    const endRes = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ tripId: dupId });
    expect(endRes.status).toBe(200);
    expect(endRes.body.trip?.status).toBe('COMPLETED');

    const ended = await db.getTripById(dupId, 'college_apex');
    expect(ended?.status).toBe('COMPLETED');

    const leftover = await db.getActiveTripForDriver('usr_driver_marcus', 'college_apex');
    expect(leftover?.id).toBe(otherId);
    expect(leftover?.status).toBe('IN_PROGRESS');
  });

  it('does not end another driver\'s active trip', async () => {
    await drainDriver(driverToken);
    const elenaBefore = await db.getActiveTripForDriver('usr_driver_elena', 'college_apex');
    expect(elenaBefore).not.toBeNull();

    await db.createTrip(tripFields({ id: 'trip_marcus_iso_' + Date.now() }));
    const endRes = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(endRes.status).toBe(200);

    const elenaAfter = await db.getActiveTripForDriver('usr_driver_elena', 'college_apex');
    expect(elenaAfter?.id).toBe(elenaBefore!.id);
    expect(elenaAfter?.status).toBe('IN_PROGRESS');
  });

  it('rejects a second end with 404 and rejects a concurrent start with 409', async () => {
    await drainDriver(driverToken);
    const start1 = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ busId: 'bus_104', routeId: 'route_blue' });
    expect(start1.status).toBe(201);

    const start2 = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ busId: 'bus_104', routeId: 'route_blue' });
    expect(start2.status).toBe(409);

    const end1 = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(end1.status).toBe(200);

    const end2 = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    expect(end2.status).toBe(404);

    const restart = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ busId: 'bus_104', routeId: 'route_blue' });
    expect(restart.status).toBe(201);
  });

  it('persists GPS onto the bus record and rejects another driver', async () => {
    await drainDriver(driverToken);
    const start = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ busId: 'bus_104', routeId: 'route_blue' });
    expect(start.status).toBe(201);
    const tripId = start.body.trip.id as string;

    const ok = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        id: 'loc_persist_bus_' + Date.now(),
        busId: 'bus_104',
        tripId,
        lat: 34.0611,
        lng: -118.2611,
        speed: 5,
        heading: 12,
        accuracy: 4,
        timestamp: new Date().toISOString(),
        isSimulated: false,
      });
    expect(ok.status).toBe(200);

    const bus = await db.getBusById('bus_104', 'college_apex');
    expect(bus?.last_location_lat).toBeCloseTo(34.0611, 5);
    expect(bus?.last_location_lng).toBeCloseTo(-118.2611, 5);

    const forbidden = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${elenaToken}`)
      .send({
        id: 'loc_forbidden_' + Date.now(),
        busId: 'bus_104',
        tripId,
        lat: 34.07,
        lng: -118.27,
        speed: 5,
        heading: 12,
        accuracy: 4,
        timestamp: new Date().toISOString(),
        isSimulated: false,
      });
    expect(forbidden.status).toBe(403);
  });
});
