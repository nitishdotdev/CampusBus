import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, ev, freshTrip, MONGO_URI, type Harness } from './harness';

const MIN = 60_000;
describe.skipIf(!MONGO_URI)('GPS ingestion: data integrity', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const tok = () => h.token({ id: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' });
  const send = (tripId: string, events: unknown[]) =>
    request(h.app).post('/api/v1/telemetry').set('Authorization', `Bearer ${tok()}`).send({ tripId, events });
  const live = () => h.models.VehicleLocation.findOne({ busId: h.seed.bus1 }).lean();
  const history = (tripId: string) => h.models.Telemetry.find({ tripId }).sort({ capturedAt: 1 }).lean();

  describe('timestamps are untrusted', () => {
    it('rejects future, ancient and pre-trip capture times; accepts small clock skew', async () => {
      const trip = await freshTrip(h);
      h.clock.advance(2 * MIN);
      const res = await send(trip.id, [
        ev(h, 60_000), ev(h, 5_000), ev(h, -25 * 3600_000), ev(h, -(3 * MIN + 30_000)), ev(h, -1_000),
      ]);
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.reason ?? r.status)).toEqual([
        'FUTURE_TIMESTAMP', 'accepted', 'EVENT_TOO_OLD', 'BEFORE_TRIP_START', 'accepted',
      ]);
    });
    it('records the server receipt time separately from the device capture time', async () => {
      const trip = await freshTrip(h);
      const e = ev(h, -2_000);
      await send(trip.id, [e]);
      const [rec] = await history(trip.id);
      expect(rec!.receivedAt.toISOString()).toBe(h.clock.now().toISOString());
      expect(rec!.capturedAt.toISOString()).toBe(e.capturedAt);
      expect(rec!.capturedAt.getTime()).not.toBe(rec!.receivedAt.getTime());
    });
  });

  describe('validation', () => {
    it('rejects invalid coordinates and fields per event without blocking valid events in the same batch', async () => {
      const trip = await freshTrip(h);
      const res = await send(trip.id, [
        ev(h, -9000, 91, 10), ev(h, -8900, 10, 181), ev(h, -8800, 0, 0), ev(h, -8700, 28.46, 77.02, { accuracyM: -1 }),
        ev(h, -8600, 28.46, 77.02, { speedMps: 500 }), ev(h, -8500, 28.46, 77.02, { headingDeg: 400 }),
        { ...ev(h, -8400), lat: 'x' }, { ...ev(h, -8300), eventId: 'x' }, { ...ev(h, -8200), capturedAt: 'not a date' },
        ev(h, -1000),
      ]);
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.reason ?? r.status)).toEqual([
        'INVALID_LAT', 'INVALID_LNG', 'INVALID_COORDINATES', 'INVALID_ACCURACYM', 'INVALID_SPEEDMPS',
        'INVALID_HEADINGDEG', 'INVALID_LAT', 'INVALID_EVENTID', 'INVALID_CAPTUREDAT', 'accepted',
      ]);
      expect(await history(trip.id)).toHaveLength(1);
    });
    it('enforces batch size and payload size limits', async () => {
      const trip = await freshTrip(h);
      const tooMany = await send(trip.id, Array.from({ length: 51 }, (_, i) => ev(h, -1000 - i)));
      expect(tooMany.status).toBe(400);
      expect((await send(trip.id, [])).status).toBe(400);
      const huge = await request(h.app).post('/api/v1/telemetry').set('Authorization', `Bearer ${tok()}`)
        .send({ tripId: trip.id, events: [{ ...ev(h, -1000), pad: 'x'.repeat(70_000) }] });
      expect(huge.status).toBe(413);
      expect(await history(trip.id)).toHaveLength(0);
    });
  });

  describe('idempotency and ordering', () => {
    it('processes a duplicate event id once: one history row, one broadcast', async () => {
      const trip = await freshTrip(h);
      const e = ev(h, -1_000);
      const a = await send(trip.id, [e]);
      const b = await send(trip.id, [e]);
      expect(a.body.results[0]).toMatchObject({ status: 'accepted', appliedToLive: true });
      expect(b.body.results[0].status).toBe('duplicate');
      expect(await history(trip.id)).toHaveLength(1);
      expect(h.emitted).toHaveLength(1);
    });
    it('the same event id inside one batch is also stored once', async () => {
      const trip = await freshTrip(h);
      const e = ev(h, -1_000);
      const res = await send(trip.id, [e, e]);
      expect(res.body.results.map((r: any) => r.status).sort()).toEqual(['accepted', 'duplicate']);
      expect(await history(trip.id)).toHaveLength(1);
    });
    it('a delayed older event is kept as history but never moves the live position backwards', async () => {
      const trip = await freshTrip(h);
      const newer = ev(h, -1_000, 28.4600, 77.0270);
      const older = ev(h, -4_000, 28.4590, 77.0260);
      expect((await send(trip.id, [newer])).body.results[0].appliedToLive).toBe(true);
      const late = await send(trip.id, [older]);
      expect(late.body.results[0]).toMatchObject({ status: 'accepted', appliedToLive: false });
      expect((await live())!.location.coordinates).toEqual([77.0270, 28.4600]);
      expect(await history(trip.id)).toHaveLength(2);
      expect(h.emitted).toHaveLength(1);
    });
    it('a batch delivered newest-first is processed oldest-first and ends on the newest position', async () => {
      const trip = await freshTrip(h);
      const e1 = ev(h, -6_000, 28.4590, 77.0260), e2 = ev(h, -3_000, 28.4592, 77.0262), e3 = ev(h, -1_000, 28.4594, 77.0264);
      const res = await send(trip.id, [e3, e1, e2]);
      expect(res.body.results.map((r: any) => r.status)).toEqual(['accepted', 'accepted', 'accepted']);
      expect((await live())!.location.coordinates).toEqual([77.0264, 28.4594]);
      expect((await history(trip.id)).map((r) => r.eventId)).toEqual([e1.eventId, e2.eventId, e3.eventId]);
    });
  });

  describe('offline synchronisation', () => {
    it('queued events captured minutes ago are stored but cannot overwrite or create a "live" position', async () => {
      const trip = await freshTrip(h);
      h.clock.advance(10 * MIN);
      const queued = [ev(h, -5 * MIN, 28.4500, 77.0100), ev(h, -4 * MIN, 28.4501, 77.0101), ev(h, -3 * MIN, 28.4502, 77.0102)];
      const res = await send(trip.id, queued);
      expect(res.body.results.map((r: any) => [r.status, r.appliedToLive])).toEqual([['accepted', false], ['accepted', false], ['accepted', false]]);
      expect(await live()).toBeNull();
      expect(await history(trip.id)).toHaveLength(3);
      expect(h.emitted).toHaveLength(0);
      const fresh = await send(trip.id, [ev(h, -500, 28.4700, 77.0300)]);
      expect(fresh.body.results[0].appliedToLive).toBe(true);
      const again = await send(trip.id, queued); // retry of the same queue after a lost response
      expect(again.body.results.map((r: any) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
      expect((await live())!.location.coordinates).toEqual([77.0300, 28.4700]);
      expect(await history(trip.id)).toHaveLength(4);
    });
    it('low-accuracy fixes are kept as history but not shown live', async () => {
      const trip = await freshTrip(h);
      const res = await send(trip.id, [ev(h, -500, 28.46, 77.02, { accuracyM: 900 })]);
      expect(res.body.results[0]).toMatchObject({ status: 'accepted', appliedToLive: false });
      expect(await live()).toBeNull();
    });
  });

  describe('ended trips', () => {
    it('accepts in-window late sync as history only, rejects out-of-window events and, after the grace period, everything', async () => {
      const trip = await freshTrip(h);
      await send(trip.id, [ev(h, -500, 28.4600, 77.0270)]);
      h.clock.advance(5 * MIN);
      const before = (await live())!.capturedAt.toISOString();
      await h.services.trips.end({ userId: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' }, trip.id);
      h.clock.advance(60 * MIN);
      // trip: start S, ended S+6min, now S+66min. -62min = S+4min (inside the trip); -30min = S+36min (after it ended)
      const res = await send(trip.id, [ev(h, -(62 * MIN), 28.4601, 77.0271), ev(h, -(30 * MIN), 28.4602, 77.0272)]);
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.reason ?? [r.status, r.appliedToLive])).toEqual([['accepted', false], 'AFTER_TRIP_END']);
      const stored = await history(trip.id);
      expect(stored[stored.length - 1]!.lateSync).toBe(true);
      expect((await live())!.capturedAt.toISOString()).toBe(before);
      expect(h.emitted).toHaveLength(1);
      h.clock.advance(7 * 3600_000);
      const expired = await send(trip.id, [ev(h, -(7 * 3600_000 + 58 * MIN))]);
      expect(expired.status).toBe(409);
      expect(expired.body.error).toBe('TRIP_NOT_ACTIVE');
    });
    it('a fresh-looking event that arrives just after the trip ended is history only and never goes live', async () => {
      const trip = await freshTrip(h);
      await send(trip.id, [ev(h, -4_000, 28.4600, 77.0270)]);
      const liveBefore = (await live())!.capturedAt.toISOString();
      h.emitted.length = 0;
      await h.services.trips.end({ userId: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' }, trip.id);
      h.clock.advance(4_000);
      const res = await send(trip.id, [ev(h, -2_000, 28.4601, 77.0271)]); // captured 2 s ago = end+2 s: inside the window and still "fresh"
      expect(res.body.results[0]).toMatchObject({ status: 'accepted', appliedToLive: false });
      expect((await live())!.capturedAt.toISOString()).toBe(liveBefore);
      expect(h.emitted).toHaveLength(0);
      expect((await history(trip.id)).pop()!.lateSync).toBe(true);
    });
    it('an ended trip cannot be ended twice and cannot be restarted by reporting into it', async () => {
      const trip = await freshTrip(h);
      const p = { userId: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' as const };
      await h.services.trips.end(p, trip.id);
      await expect(h.services.trips.end(p, trip.id)).rejects.toMatchObject({ status: 409, code: 'TRIP_NOT_ACTIVE' });
      expect((await h.models.Trip.findById(trip.id).lean())!.status).toBe('COMPLETED');
    });
  });

  describe('plausibility and speed', () => {
    it('rejects an impossible jump but tolerates ordinary GPS jitter', async () => {
      const trip = await freshTrip(h);
      await send(trip.id, [ev(h, -10_000, 28.4595, 77.0266)]);
      const res = await send(trip.id, [ev(h, -7_000, 28.9000, 77.0266), ev(h, -6_000, 28.45955, 77.02665)]);
      expect(res.body.results.map((r: any) => r.reason ?? r.status)).toEqual(['IMPLAUSIBLE_JUMP', 'accepted']);
    });
    it('never invents a speed: unavailable without data, derived from consecutive fixes, device value when given', async () => {
      const trip = await freshTrip(h);
      await send(trip.id, [ev(h, -9_000, 28.4595, 77.0266)]);
      await send(trip.id, [ev(h, -6_000, 28.4596, 77.0266)]);              // ~11 m in 3 s
      await send(trip.id, [ev(h, -3_000, 28.4597, 77.0266, { speedMps: 5 })]);
      const rows = await history(trip.id);
      expect(rows[0]).toMatchObject({ speedMps: null, speedSource: 'unavailable' });
      expect(rows[1]!.speedSource).toBe('derived');
      expect(rows[1]!.speedMps).toBeGreaterThan(3.3); expect(rows[1]!.speedMps).toBeLessThan(4.1);
      expect(rows[2]).toMatchObject({ speedMps: 5, speedSource: 'device' });
    });
    it('does not derive speed across a long gap', async () => {
      const trip = await freshTrip(h);
      await send(trip.id, [ev(h, -9_000, 28.4595, 77.0266)]);
      h.clock.advance(5 * MIN);
      await send(trip.id, [ev(h, -1_000, 28.4600, 77.0266)]);
      const rows = await history(trip.id);
      expect(rows[1]).toMatchObject({ speedMps: null, speedSource: 'unavailable' });
    });
  });
});

describe.skipIf(!MONGO_URI)('GPS ingestion: rate limiting', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness({ rateLimitEvents: 5, rateLimitWindowMs: 60_000 }); });
  afterAll(async () => { await h.close(); });
  it('limits events per authenticated driver per window (batch cost = its size) and recovers next window', async () => {
    const trip = await freshTrip(h);
    const tok = h.token({ id: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' });
    const go = (n: number) => request(h.app).post('/api/v1/telemetry').set('Authorization', `Bearer ${tok}`)
      .send({ tripId: trip.id, events: Array.from({ length: n }, (_, i) => ev(h, -1000 - i * 100, 28.4595 + i * 1e-6)) });
    expect((await go(3)).status).toBe(200);
    const blocked = await go(3);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('RATE_LIMITED');
    expect((await go(2)).status).toBe(200);
    h.clock.advance(61_000);
    expect((await go(3)).status).toBe(200);
  });
});
