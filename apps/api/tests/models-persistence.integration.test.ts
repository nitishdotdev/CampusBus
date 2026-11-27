import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyV1Schema } from '../src/infra/postgres/pool';
import { createPostgresRepositories } from '../src/infra/postgres/repositories';
import { createHarness, id, PG_TEST_URL, T0, type Harness } from './harness';

describe.skipIf(!PG_TEST_URL)('PostgreSQL repositories and API validation', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h?.close(); });
  const a = () => h.seed.campusA;
  const adminPost = (resource: string, body: object) => request(h.app).post(`/api/v1/${resource}`)
    .set('Authorization', `Bearer ${h.token({ id: h.seed.adminA, campusId: a(), role: 'ADMIN' })}`).send(body);

  it('scopes case-insensitive email uniqueness to each campus and omits hashes from user records', async () => {
    const user = { name: 'Test User', email: 'Dup@Example.test', passwordHash: 'hash', role: 'STUDENT' as const, status: 'ACTIVE' as const };
    const { users } = h.services.repos;
    const created = await users.create({ ...user, campusId: a() });
    await expect(users.create({ ...user, campusId: a(), email: 'dup@example.test' })).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    await expect(users.create({ ...user, campusId: h.seed.campusB })).resolves.toBeTruthy();
    expect(await users.findById(a(), created.id)).toMatchObject({ email: 'dup@example.test' });
    expect(await users.findById(a(), created.id)).not.toHaveProperty('passwordHash');
    for (const [column, value] of [['role', 'ROOT'], ['status', 'WEIRD']] as const) {
      await expect(h.pool.query(`UPDATE v1.users SET ${column} = $1 WHERE id = $2`, [value, created.id])).rejects.toMatchObject({ code: '23514' });
    }
    expect((await request(h.app).post('/api/v1/auth/register').send({ ...user, password: 'Password1!', campusId: a(), email: 'invalid' })).status).toBe(400);
  });

  it('scopes bus numbers and enforces unique assigned drivers and valid capacities', async () => {
    const bus = { campusId: a(), number: 'B1', capacity: 30, status: 'ACTIVE' as const };
    const { buses } = h.services.repos;
    await expect(buses.create(bus)).rejects.toMatchObject({ code: 'BUS_NUMBER_TAKEN' });
    await expect(buses.create({ ...bus, campusId: h.seed.campusB })).resolves.toBeTruthy();
    await expect(buses.create({ ...bus, number: 'DUPDRV', driverId: h.seed.driver1 })).rejects.toMatchObject({ code: '23505', constraint: 'buses_driver_unique' });
    for (const number of ['NODRV1', 'NODRV2']) await expect(buses.create({ ...bus, number })).resolves.toBeTruthy();
    await expect(buses.create({ ...bus, number: 'BAD', capacity: 0 })).rejects.toMatchObject({ code: '23514' });
    expect((await adminPost('buses', { number: 'BAD2', capacity: 12.5 })).status).toBe(400);
  });

  it('enforces route code and stop order uniqueness, coordinate bounds, and color syntax', async () => {
    const stop = (order: number, lng = 77, lat = 28.4) => ({ name: `S${order}`, order, lat, lng });
    const route = { name: 'Route', code: 'RS', color: '#2563eb', stops: [stop(0), stop(1)] };
    expect((await adminPost('routes', route)).status).toBe(201);
    expect((await adminPost('routes', { ...route, code: 'R1' })).status).toBe(409);
    await expect(h.pool.query('UPDATE v1.stops SET stop_order = 0 WHERE route_id = (SELECT id FROM v1.routes WHERE campus_id=$1 AND code=$2)', [a(), 'RS'])).rejects.toMatchObject({ code: '23505' });
    for (const patch of [{ stops: [stop(0, 77, 95)] }, { stops: [stop(0, 200, 10)] }, { color: 'red' }]) {
      expect((await adminPost('routes', { ...route, code: 'INVALID', ...patch })).status).toBe(400);
    }
  });

  it('validates schedule time, days, and direction at the API boundary', async () => {
    const base = { routeId: h.seed.route1, busId: h.seed.bus1, direction: 'TO_CAMPUS', daysOfWeek: [1, 2], departTime: '08:30' };
    expect((await adminPost('schedules', base)).status).toBe(201);
    for (const bad of [{ departTime: '25:00' }, { departTime: '8:30' }, { daysOfWeek: [] }, { daysOfWeek: [7] }, { direction: 'SIDEWAYS' }]) {
      expect((await adminPost('schedules', { ...base, ...bad })).status).toBe(400);
    }
  });

  it('atomically limits active trips and allows another trip after ending', async () => {
    const { trips } = h.services.repos;
    const t = { campusId: a(), busId: h.seed.bus1, driverId: h.seed.driver1, routeId: h.seed.route1, mode: 'REAL' as const, startedAt: T0 };
    const first = await trips.start(t);
    await expect(trips.start(t)).rejects.toMatchObject({ status: 409, code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' });
    await expect(trips.start({ ...t, busId: h.seed.bus2 })).rejects.toMatchObject({ code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' });
    await expect(trips.start({ ...t, driverId: h.seed.driver2 })).rejects.toMatchObject({ code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' });
    const racers = await Promise.allSettled(Array.from({ length: 5 }, () => trips.start({ ...t, busId: h.seed.bus2, driverId: h.seed.driver2 })));
    expect(racers.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await trips.end(a(), first.id, new Date()))?.status).toBe('COMPLETED');
    expect(await trips.end(a(), first.id, new Date())).toBeNull();
    await expect(trips.start(t)).resolves.toBeTruthy();
    expect(await trips.findActiveByBus(a(), h.seed.bus1)).not.toBeNull();
    expect(await trips.findById(h.seed.campusB, first.id)).toBeNull();
  });

  it('validates notifications and constrains emergency alert states', async () => {
    expect((await adminPost('notifications', { kind: 'DELAY', title: 'Delay on R1', body: 'Ten minutes' })).status).toBe(201);
    expect((await adminPost('notifications', { kind: 'JOKE', title: 'Invalid kind', body: 'Message' })).status).toBe(400);
    expect((await adminPost('notifications', { kind: 'DELAY', title: 'ab', body: 'Message' })).status).toBe(400);
    const { alerts } = h.services.repos;
    const alert = await alerts.create({ campusId: a(), busId: h.seed.bus1, raisedBy: h.seed.driver1, message: 'Breakdown', status: 'OPEN', location: { lat: 28.46, lng: 77.02 } });
    expect(alert.status).toBe('OPEN');
    await expect(h.pool.query("UPDATE v1.emergency_alerts SET status = 'DONE' WHERE id = $1", [alert.id])).rejects.toMatchObject({ code: '23514' });
  });

  it('creates the schema repeatedly and declares indexes for production access paths', async () => {
    await applyV1Schema(h.pool);
    const indexes = await h.pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'v1'");
    const definition = (name: string) => indexes.rows.find((row) => row.indexname === name)?.indexdef;
    for (const name of ['telemetry_trip_event_key', 'vehicle_locations_pkey', 'trips_active_bus_key', 'trips_active_driver_key', 'users_campus_email_key']) {
      expect(definition(name)).toMatch(/CREATE UNIQUE INDEX/);
    }
    expect(definition('idx_v1_telemetry_trip_captured')).toContain('(trip_id, captured_at)');
    expect(definition('idx_v1_telemetry_received')).toContain('(received_at)');
  });
});

describe.skipIf(!PG_TEST_URL)('Repositories: pagination, retention and persistence across restarts', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  it('paginates with clamped page sizes and a stable total', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) => h.services.repos.buses.create({
      campusId: h.seed.campusA, number: `P${String(i).padStart(2, '0')}`, capacity: 20, status: 'ACTIVE',
    })));
    const { buses } = h.services.repos;
    const p3 = await buses.list(h.seed.campusA, { page: 3, pageSize: 10 });
    expect(p3.items).toHaveLength(10);
    expect(p3.total).toBe(33); // 30 + 3 seeded
    expect(p3.items.map((b) => b.number)).toEqual([...p3.items.map((b) => b.number)].sort());
    expect((await buses.list(h.seed.campusA, { pageSize: 10_000 })).pageSize).toBe(100);
    expect((await buses.list(h.seed.campusA, { page: -4, pageSize: 0 })).page).toBe(1);
    expect((await buses.list(h.seed.campusB, {})).total).toBe(0);
  });

  it('purges telemetry older than the retention cutoff and keeps newer rows', async () => {
    const { telemetry } = h.services.repos;
    const mk = (n: number, receivedAt: Date) => ({
      campusId: h.seed.campusA, tripId: id(), busId: id(), driverId: id(), eventId: `purge_evt_${n}`, location: { lat: 28.4, lng: 77.0 },
      accuracyM: null, speedMps: null, speedSource: 'unavailable' as const, headingDeg: null, capturedAt: receivedAt, receivedAt,
      liveEligible: false, lateSync: false, mode: 'REAL' as const,
    });
    const old = new Date(Date.now() - 100 * 86400_000), recent = new Date();
    await telemetry.insertIdempotent(mk(1, old)); await telemetry.insertIdempotent(mk(2, old)); await telemetry.insertIdempotent(mk(3, recent));
    const removed = await telemetry.purgeReceivedBefore(new Date(Date.now() - 90 * 86400_000));
    expect(removed).toBe(2);
    expect((await h.pool.query("SELECT event_id FROM v1.telemetry WHERE left(event_id, 10) = 'purge_evt_'")).rows).toEqual([{ event_id: 'purge_evt_3' }]);
  });

  it('data, live position and idempotency survive closing the connection and starting a new one', async () => {
    const { campusA, driver1, bus1 } = h.seed;
    const trip = await h.services.trips.start({ userId: driver1, campusId: campusA, role: 'DRIVER' }, { busId: bus1 });
    h.clock.advance(60_000);
    const e = { eventId: 'restart_evt_0001', lat: 28.4601, lng: 77.0271, capturedAt: new Date(h.clock.now().getTime() - 1000).toISOString() };
    const r = await h.services.ingest.ingest({ userId: driver1, campusId: campusA, role: 'DRIVER' }, { tripId: trip.id, events: [e] });
    expect(r.results[0]).toMatchObject({ status: 'accepted', appliedToLive: true });

    const pool = new pg.Pool({ connectionString: h.connectionString });
    try {
      await applyV1Schema(pool);
      const repos2 = createPostgresRepositories(pool);
      expect(await repos2.trips.findActiveByBus(campusA, bus1)).toMatchObject({ id: trip.id, status: 'ACTIVE' });
      expect(await repos2.live.getByBus(campusA, bus1)).toMatchObject({ tripId: trip.id, location: { lat: 28.4601, lng: 77.0271 } });
      expect((await repos2.telemetry.listByTrip(trip.id, {})).total).toBe(1);
      const dup = await repos2.telemetry.insertIdempotent({
        campusId: campusA, tripId: trip.id, busId: bus1, driverId: driver1, eventId: e.eventId, location: { lat: 28.4601, lng: 77.0271 },
        accuracyM: null, speedMps: null, speedSource: 'unavailable', headingDeg: null, capturedAt: new Date(e.capturedAt), receivedAt: h.clock.now(),
        liveEligible: true, lateSync: false, mode: 'REAL',
      });
      expect(dup).toBe('duplicate');
      await expect(repos2.trips.start({ campusId: campusA, busId: bus1, driverId: driver1, routeId: h.seed.route1, mode: 'REAL', startedAt: h.clock.now() })).rejects.toMatchObject({ status: 409 });
    } finally {
      await pool.end();
    }
  });
});
