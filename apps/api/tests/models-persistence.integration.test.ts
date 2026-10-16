import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createModels, ensureIndexes } from '../src/infra/mongo/models';
import { createRepositories } from '../src/infra/mongo/repositories';
import { createHarness, id, MONGO_URI, T0, type Harness } from './harness';

describe.skipIf(!MONGO_URI)('MongoDB models: constraints and validation', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });
  const m = () => h.models as any; // invalid values are passed on purpose
  const a = () => h.seed.campusA;

  it('users: email unique per campus (same email allowed in another campus); role/status/email validated; hash not selected', async () => {
    const mk = (campusId: string, email: string, extra: object = {}): Promise<unknown> => m().User.create({ campusId, email, passwordHash: 'x', name: 'N', role: 'STUDENT', ...extra });
    await mk(a(), 'Dup@Example.test');
    await expect(mk(a(), 'dup@example.test')).rejects.toMatchObject({ code: 11000 });
    await expect(mk(h.seed.campusB, 'dup@example.test')).resolves.toBeTruthy();
    await expect(mk(a(), 'not-an-email')).rejects.toThrow(/validation/i);
    await expect(mk(a(), 'x1@example.test', { role: 'ROOT' })).rejects.toThrow(/validation/i);
    await expect(mk(a(), 'x2@example.test', { status: 'WEIRD' })).rejects.toThrow(/validation/i);
    expect(((await m().User.findOne({ email: 'dup@example.test', campusId: a() }).lean()) as any).email).toBe('dup@example.test');
    expect((await m().User.findOne({ email: 'dup@example.test', campusId: a() }))!.passwordHash).toBeUndefined();
  });

  it('buses: number unique per campus; a driver can be assigned to only one bus; capacity bounds', async () => {
    await expect(m().Bus.create({ campusId: a(), number: 'B1', capacity: 30 })).rejects.toMatchObject({ code: 11000 });
    await expect(m().Bus.create({ campusId: h.seed.campusB, number: 'B1', capacity: 30 })).resolves.toBeTruthy();
    await expect(m().Bus.create({ campusId: a(), number: 'DUPDRV', capacity: 30, driverId: h.seed.driver1 })).rejects.toMatchObject({ code: 11000 });
    await expect(m().Bus.create({ campusId: a(), number: 'NODRV1', capacity: 30 })).resolves.toBeTruthy();
    await expect(m().Bus.create({ campusId: a(), number: 'NODRV2', capacity: 30 })).resolves.toBeTruthy(); // sparse: no collision
    await expect(m().Bus.create({ campusId: a(), number: 'BAD', capacity: 0 })).rejects.toThrow(/validation/i);
    await expect(m().Bus.create({ campusId: a(), number: 'BAD2', capacity: 12.5 })).rejects.toThrow(/validation/i);
  });

  it('routes: unique code per campus, unique stop order, valid stop coordinates and colour', async () => {
    const stop = (order: number, lng = 77.0, lat = 28.4) => ({ name: `S${order}`, order, location: { type: 'Point', coordinates: [lng, lat] } });
    await expect(m().Route.create({ campusId: a(), code: 'R1', name: 'dup' })).rejects.toMatchObject({ code: 11000 });
    await expect(m().Route.create({ campusId: a(), code: 'RS', name: 'ok', stops: [stop(0), stop(1)] })).resolves.toBeTruthy();
    await expect(m().Route.create({ campusId: a(), code: 'RS2', name: 'dup order', stops: [stop(1), stop(1)] })).rejects.toThrow(/unique/i);
    await expect(m().Route.create({ campusId: a(), code: 'RS3', name: 'bad lat', stops: [stop(0, 77, 95)] })).rejects.toThrow(/validation/i);
    await expect(m().Route.create({ campusId: a(), code: 'RS4', name: 'bad lng', stops: [stop(0, 200, 10)] })).rejects.toThrow(/validation/i);
    await expect(m().Route.create({ campusId: a(), code: 'RS5', name: 'colour', color: 'red' })).rejects.toThrow(/validation/i);
  });

  it('schedules validate time, days and direction', async () => {
    const base: any = { campusId: a(), routeId: h.seed.route1, busId: h.seed.bus1, direction: 'TO_CAMPUS', daysOfWeek: [1, 2], departTime: '08:30' };
    await expect(m().Schedule.create(base)).resolves.toBeTruthy();
    for (const bad of [{ departTime: '25:00' }, { departTime: '8:30' }, { daysOfWeek: [] }, { daysOfWeek: [7] }, { direction: 'SIDEWAYS' }])
      await expect(m().Schedule.create({ ...base, ...bad })).rejects.toThrow(/validation/i);
  });

  it('trips: one active trip per bus and per driver (atomic), restartable after end, end is single-shot', async () => {
    const { trips } = createRepositories(h.models);
    await m().Trip.deleteMany({});
    const t = { campusId: a(), busId: h.seed.bus1, driverId: h.seed.driver1, routeId: h.seed.route1, mode: 'REAL' as const, startedAt: T0 };
    const first = await trips.start(t);
    await expect(trips.start(t)).rejects.toMatchObject({ status: 409, code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' });
    await expect(trips.start({ ...t, busId: h.seed.bus2 })).rejects.toMatchObject({ code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' }); // same driver
    await expect(trips.start({ ...t, driverId: h.seed.driver2 })).rejects.toMatchObject({ code: 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP' }); // same bus
    const racers = await Promise.allSettled(Array.from({ length: 5 }, () => trips.start({ ...t, busId: h.seed.bus2, driverId: h.seed.driver2 })));
    expect(racers.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await trips.end(a(), first.id, new Date()))!.status).toBe('COMPLETED');
    expect(await trips.end(a(), first.id, new Date())).toBeNull();
    await expect(trips.start(t)).resolves.toBeTruthy();
    expect(await trips.findActiveByBus(a(), h.seed.bus1)).not.toBeNull();
    expect(await trips.findById(h.seed.campusB, first.id)).toBeNull(); // campus scoped
  });

  it('notifications, emergency alerts and audit events validate and index', async () => {
    await expect(m().Notification.create({ campusId: a(), kind: 'DELAY', title: 'Delay on R1', body: 'Ten minutes', createdBy: h.seed.adminA })).resolves.toBeTruthy();
    await expect(m().Notification.create({ campusId: a(), kind: 'JOKE', title: 'x', body: 'y', createdBy: h.seed.adminA })).rejects.toThrow(/validation/i);
    await expect(m().Notification.create({ campusId: a(), kind: 'DELAY', title: 'ab', body: 'y', createdBy: h.seed.adminA })).rejects.toThrow(/validation/i);
    const alert = await m().EmergencyAlert.create({ campusId: a(), busId: h.seed.bus1, raisedBy: h.seed.driver1, message: 'Breakdown', location: { type: 'Point', coordinates: [77.02, 28.46] } });
    expect(alert.status).toBe('OPEN');
    await expect(m().EmergencyAlert.create({ campusId: a(), busId: h.seed.bus1, raisedBy: h.seed.driver1, status: 'DONE' })).rejects.toThrow(/validation/i);
    await expect(m().AuditEvent.create({ campusId: a(), actorId: h.seed.adminA, action: 'bus.create', targetType: 'Bus', targetId: h.seed.bus1, meta: { number: 'B9' } })).resolves.toBeTruthy();
  });

  it('declares the indexes the access paths rely on', async () => {
    const names = async (c: string) => (await h.conn.collection(c).indexes()).map((i: any) => `${JSON.stringify(i.key)}${i.unique ? ' unique' : ''}`);
    expect(await names('telemetries')).toEqual(expect.arrayContaining(['{"tripId":1,"eventId":1} unique', '{"tripId":1,"capturedAt":1}', '{"receivedAt":1}']));
    expect(await names('vehiclelocations')).toEqual(expect.arrayContaining(['{"busId":1} unique']));
    expect(await names('trips')).toEqual(expect.arrayContaining(['{"activeBusKey":1} unique', '{"activeDriverKey":1} unique']));
    expect(await names('users')).toEqual(expect.arrayContaining(['{"campusId":1,"email":1} unique']));
  });
});

describe.skipIf(!MONGO_URI)('Repositories: pagination, retention and persistence across restarts', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  it('paginates with clamped page sizes and a stable total', async () => {
    await h.models.Bus.insertMany(Array.from({ length: 30 }, (_, i) => ({ campusId: h.seed.campusA, number: `P${String(i).padStart(2, '0')}`, capacity: 20 })));
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
    expect(await h.models.Telemetry.countDocuments({ eventId: /^purge_evt_/ })).toBe(1);
  });

  it('data, live position and idempotency survive closing the connection and starting a new one', async () => {
    const { campusA, driver1, bus1 } = h.seed;
    await h.models.Trip.deleteMany({});
    const trip = await h.services.trips.start({ userId: driver1, campusId: campusA, role: 'DRIVER' }, { busId: bus1 });
    h.clock.advance(60_000);
    const e = { eventId: 'restart_evt_0001', lat: 28.4601, lng: 77.0271, capturedAt: new Date(h.clock.now().getTime() - 1000).toISOString() };
    const r = await h.services.ingest.ingest({ userId: driver1, campusId: campusA, role: 'DRIVER' }, { tripId: trip.id, events: [e] });
    expect(r.results[0]).toMatchObject({ status: 'accepted', appliedToLive: true });

    // "restart": drop every in-process object and reconnect from scratch
    const uri = `${MONGO_URI!.replace(/\/$/, '')}/${h.dbName}`;
    await h.conn.close();
    const conn2 = await mongoose.createConnection(uri).asPromise();
    try {
      const models2 = createModels(conn2);
      await ensureIndexes(models2);
      const repos2 = createRepositories(models2);
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
      await conn2.close();
    }
    h.conn = await mongoose.createConnection(uri).asPromise(); // so afterAll can drop the database
  });
});
