import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTrackingConfig } from '../src/config/env';
import { createHarness, ev, freshTrip, id, MONGO_URI, P, T0, type Harness } from './harness';

const post = (h: Harness, token: string | null, body: unknown) => {
  const r = request(h.app).post('/api/v1/telemetry');
  return (token ? r.set('Authorization', `Bearer ${token}`) : r).send(body as object);
};
const count = (h: Harness, tripId: string) => h.models.Telemetry.countDocuments({ tripId });

describe.skipIf(!MONGO_URI)('GPS ingestion: authorization', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const driver1Token = () => h.token({ id: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' });

  it('requires authentication', async () => {
    const trip = await freshTrip(h);
    expect((await post(h, null, { tripId: trip.id, events: [ev(h, 0)] })).status).toBe(401);
    expect((await post(h, 'garbage', { tripId: trip.id, events: [ev(h, 0)] })).status).toBe(401);
    expect(await count(h, trip.id)).toBe(0);
  });

  it('only drivers may report: students and admins are refused', async () => {
    const trip = await freshTrip(h);
    for (const [uid, role] of [[h.seed.studentR1, 'STUDENT'], [h.seed.adminA, 'ADMIN']] as const) {
      const res = await post(h, h.token({ id: uid, campusId: h.seed.campusA, role }), { tripId: trip.id, events: [ev(h, 0)] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('DRIVER_ROLE_REQUIRED');
    }
    expect(await count(h, trip.id)).toBe(0);
  });

  it('a validly signed token for a nonexistent or disabled account is refused', async () => {
    const trip = await freshTrip(h);
    const ghost = await post(h, h.token({ id: id(), campusId: h.seed.campusA, role: 'DRIVER' }), { tripId: trip.id, events: [ev(h, 0)] });
    expect(ghost.status).toBe(403);
    await h.models.User.updateOne({ _id: h.seed.driver1 }, { status: 'DISABLED' });
    const disabled = await post(h, driver1Token(), { tripId: trip.id, events: [ev(h, 0)] });
    expect(disabled.status).toBe(403);
    await h.models.User.updateOne({ _id: h.seed.driver1 }, { status: 'ACTIVE' });
    expect(await count(h, trip.id)).toBe(0);
  });

  it('an unrelated or unassigned driver cannot inject into someone else\'s trip', async () => {
    const trip = await freshTrip(h, 'driver1');
    for (const uid of [h.seed.driver2, h.seed.driverFree]) {
      const res = await post(h, h.token({ id: uid, campusId: h.seed.campusA, role: 'DRIVER' }), { tripId: trip.id, events: [ev(h, 0)] });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('TRIP_NOT_FOUND');
    }
    expect(await count(h, trip.id)).toBe(0);
    expect(await h.models.VehicleLocation.countDocuments({ busId: h.seed.bus1 })).toBe(0);
  });

  it('a driver cannot start a trip on a bus that is not assigned to them', async () => {
    await freshTrip(h, 'driver2'); // clean bus2 state
    await expect(h.services.trips.start(P(h, h.seed.driver1, 'DRIVER'), { busId: h.seed.bus2 })).rejects.toMatchObject({ status: 403, code: 'NOT_ASSIGNED_TO_BUS' });
    await expect(h.services.trips.start(P(h, h.seed.driverFree, 'DRIVER'), { busId: h.seed.bus1 })).rejects.toMatchObject({ code: 'NOT_ASSIGNED_TO_BUS' });
  });

  it('rejects spoofed, malformed and cross-campus trip identifiers', async () => {
    const tripB = await h.models.Trip.create({ campusId: h.seed.campusB, busId: id(), driverId: h.seed.driverB, routeId: id(), startedAt: T0, status: 'ACTIVE', mode: 'REAL' });
    const cases: [string, number][] = [[id(), 404], [String(tripB._id), 404], ['abc', 400], ['', 400], ['../../etc/passwd', 400]];
    for (const [tripId, status] of cases) {
      const res = await post(h, driver1Token(), { tripId, events: [ev(h, 0)] });
      expect(res.status, `tripId=${tripId}`).toBe(status);
    }
    expect(await h.models.Telemetry.countDocuments({ tripId: tripB._id })).toBe(0);
  });

  it('refuses reports after the driver was unassigned from the vehicle', async () => {
    const trip = await freshTrip(h);
    await h.models.Bus.updateOne({ _id: h.seed.bus1 }, { $unset: { driverId: 1 } });
    const res = await post(h, driver1Token(), { tripId: trip.id, events: [ev(h, 0)] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('VEHICLE_ASSIGNMENT_REVOKED');
    await h.models.Bus.updateOne({ _id: h.seed.bus1 }, { driverId: h.seed.driver1 });
    expect(await count(h, trip.id)).toBe(0);
  });
});

describe.skipIf(!MONGO_URI)('GPS ingestion: simulation flag is server-controlled', () => {
  let h: Harness; let hs: Harness;
  beforeAll(async () => { h = await createHarness(); hs = await createHarness({ simulationEnabled: true }); });
  afterAll(async () => { await h.close(); await hs.close(); });
  const tok = (x: Harness) => x.token({ id: x.seed.driver1, campusId: x.seed.campusA, role: 'DRIVER' });

  it('ignores/rejects a client-supplied isSimulated flag (top level and per event)', async () => {
    const trip = await freshTrip(h);
    const top = await post(h, tok(h), { tripId: trip.id, isSimulated: true, events: [ev(h, 0)] });
    expect(top.status).toBe(400);
    const per = await post(h, tok(h), { tripId: trip.id, events: [ev(h, -1000, 28.4595, 77.0266, { isSimulated: true }), ev(h, -500)] });
    expect(per.status).toBe(200);
    expect(per.body.results[0]).toMatchObject({ status: 'rejected', reason: 'UNKNOWN_FIELD' });
    expect(per.body.results[1].status).toBe('accepted');
    const stored = await h.models.Telemetry.find({ tripId: trip.id }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.mode).toBe('REAL');
  });

  it('a driver cannot start a simulated trip while simulation is disabled', async () => {
    await freshTrip(h);
    await h.models.Trip.updateMany({ busId: h.seed.bus1 }, { $set: { status: 'CANCELLED' }, $unset: { activeBusKey: 1, activeDriverKey: 1 } });
    const res = await request(h.app).post('/api/v1/trips/start').set('Authorization', `Bearer ${tok(h)}`).send({ busId: h.seed.bus1, simulated: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIMULATION_DISABLED');
  });

  it('when the server enables simulation, trip mode (not the payload) decides how telemetry is labelled', async () => {
    await hs.models.Trip.updateMany({}, { $set: { status: 'CANCELLED' }, $unset: { activeBusKey: 1, activeDriverKey: 1 } });
    const start = await request(hs.app).post('/api/v1/trips/start').set('Authorization', `Bearer ${tok(hs)}`).send({ busId: hs.seed.bus1, simulated: true });
    expect(start.status).toBe(201);
    expect(start.body.trip.mode).toBe('SIMULATED');
    const res = await post(hs, tok(hs), { tripId: start.body.trip.id, events: [ev(hs, -500)] });
    expect(res.body.results[0].status).toBe('accepted');
    const rec = await hs.models.Telemetry.findOne({ tripId: start.body.trip.id }).lean();
    expect(rec!.mode).toBe('SIMULATED');
    const loc = await hs.models.VehicleLocation.findOne({ busId: hs.seed.bus1 }).lean();
    expect(loc!.mode).toBe('SIMULATED');
  });

  it('production configuration cannot enable simulation', () => {
    expect(() => loadTrackingConfig({ NODE_ENV: 'production', SIMULATION_MODE: 'on' } as any)).toThrow(/not permitted/);
    expect(loadTrackingConfig({ NODE_ENV: 'production' } as any).simulationEnabled).toBe(false);
    expect(loadTrackingConfig({ NODE_ENV: 'test', SIMULATION_MODE: 'on' } as any).simulationEnabled).toBe(true);
  });
});
