import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, ev, freshTrip, id, MONGO_URI, type Harness } from './harness';

const MIN = 60_000;
describe.skipIf(!MONGO_URI)('Live snapshot access control and freshness (REST)', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });
  const as = (uid: string, role: 'STUDENT' | 'DRIVER' | 'ADMIN', campus = h.seed.campusA) => h.token({ id: uid, campusId: campus, role });
  const get = (token: string | null, busId: string) => {
    const r = request(h.app).get(`/api/v1/buses/${busId}/live`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const report = async (tripId: string, e: object) =>
    request(h.app).post('/api/v1/telemetry').set('Authorization', `Bearer ${as(h.seed.driver1, 'DRIVER')}`).send({ tripId, events: [e] });

  it('requires authentication', async () => {
    expect((await get(null, h.seed.bus1)).status).toBe(401);
  });

  it('allows exactly the intended viewers', async () => {
    await freshTrip(h);
    const allowed = [[h.seed.studentR1, 'STUDENT'], [h.seed.studentBus1, 'STUDENT'], [h.seed.adminA, 'ADMIN'], [h.seed.driver1, 'DRIVER']] as const;
    for (const [uid, role] of allowed) expect((await get(as(uid, role), h.seed.bus1)).status, `${role} ${uid}`).toBe(200);
    const denied = [[h.seed.studentR2, 'STUDENT'], [h.seed.studentNone, 'STUDENT'], [h.seed.driver2, 'DRIVER'], [h.seed.driverFree, 'DRIVER']] as const;
    for (const [uid, role] of denied) {
      const res = await get(as(uid, role), h.seed.bus1);
      expect(res.status, `${role} ${uid}`).toBe(403);
      expect(res.body.position).toBeUndefined();
    }
  });

  it('keeps campuses isolated: another campus\'s admin cannot see the bus, and bad ids are not found', async () => {
    expect((await get(as(h.seed.adminB, 'ADMIN', h.seed.campusB), h.seed.bus1)).status).toBe(404);
    expect((await get(as(h.seed.adminA, 'ADMIN'), id())).status).toBe(404);
    expect((await get(as(h.seed.adminA, 'ADMIN'), 'nope')).status).toBe(404);
  });

  it('a pending or disabled student loses access immediately', async () => {
    await freshTrip(h);
    await h.models.User.updateOne({ _id: h.seed.studentR1 }, { status: 'DISABLED' });
    expect((await get(as(h.seed.studentR1, 'STUDENT'), h.seed.bus1)).status).toBe(403);
    await h.models.User.updateOne({ _id: h.seed.studentR1 }, { status: 'ACTIVE' });
  });

  it('reports UNAVAILABLE, LIVE, STALE, DRIVER_OFFLINE and TRIP_ENDED from server-side times', async () => {
    const trip = await freshTrip(h);
    const tok = as(h.seed.studentR1, 'STUDENT');
    expect((await get(tok, h.seed.bus1)).body).toMatchObject({ freshness: 'UNAVAILABLE', position: null });
    await report(trip.id, ev(h, -1_000, 28.46, 77.027));
    expect((await get(tok, h.seed.bus1)).body).toMatchObject({ freshness: 'LIVE', tripId: trip.id });
    h.clock.advance(19_000);
    expect((await get(tok, h.seed.bus1)).body.freshness).toBe('LIVE');
    h.clock.advance(2_000);   // 21 s since receipt
    expect((await get(tok, h.seed.bus1)).body.freshness).toBe('STALE');
    h.clock.advance(2 * MIN); // > 120 s
    const off = await get(tok, h.seed.bus1);
    expect(off.body.freshness).toBe('DRIVER_OFFLINE');
    expect(off.body.position).not.toBeNull();
    await h.services.trips.end({ userId: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' }, trip.id);
    const ended = await get(tok, h.seed.bus1);
    expect(ended.body).toMatchObject({ freshness: 'TRIP_ENDED', tripId: null });
  });

  it('position age is measured from the earlier of capture and receipt, so a device clock cannot make data look fresher', async () => {
    const tok = as(h.seed.studentR1, 'STUDENT');
    // captured 25 s before it was received: already stale on arrival, even though the server just heard from the driver
    let trip = await freshTrip(h);
    await report(trip.id, ev(h, -25_000));
    expect((await get(tok, h.seed.bus1)).body).toMatchObject({ freshness: 'STALE', ageMs: 25_000 });
    // captured 8 s in the FUTURE (allowed skew): clamped to the receipt time, so it ages from receipt
    trip = await freshTrip(h);
    await report(trip.id, ev(h, 8_000));
    expect((await get(tok, h.seed.bus1)).body.freshness).toBe('LIVE');
    h.clock.advance(21_000);
    expect((await get(tok, h.seed.bus1)).body.freshness).toBe('STALE');
    h.clock.advance(5 * MIN);
    expect((await get(tok, h.seed.bus1)).body.freshness).toBe('DRIVER_OFFLINE');
  });
});

describe.skipIf(!MONGO_URI)('Socket.IO: authentication, subscriptions and delivery', () => {
  let h: Harness;
  const sockets: Socket[] = [];
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { sockets.forEach((s) => s.close()); await h.close(); });

  const tokenFor = (uid: string, role: 'STUDENT' | 'DRIVER' | 'ADMIN', campus = h.seed.campusA, ttl?: number) => h.token({ id: uid, campusId: campus, role }, ttl);
  const open = (token: string | undefined): Promise<Socket> => new Promise((resolve, reject) => {
    const s = connect(h.url, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
  const sub = (s: Socket, busId: string): Promise<any> => new Promise((r) => s.emit('subscribe:bus', { busId }, r));
  const collect = (s: Socket) => { const got: any[] = []; s.on('bus:location', (m) => got.push(m)); return got; };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const report = (tripId: string, e: object) =>
    request(h.app).post('/api/v1/telemetry').set('Authorization', `Bearer ${tokenFor(h.seed.driver1, 'DRIVER')}`).send({ tripId, events: [e] });

  it('refuses unauthenticated, malformed and expired credentials', async () => {
    await expect(open(undefined)).rejects.toThrow('UNAUTHENTICATED');
    await expect(open('not-a-jwt')).rejects.toThrow('UNAUTHENTICATED');
    const short = tokenFor(h.seed.studentR1, 'STUDENT', h.seed.campusA, 1);
    await wait(1_300);
    await expect(open(short)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('does not accept a token passed in the URL query string', async () => {
    const s = connect(`${h.url}?token=${tokenFor(h.seed.studentR1, 'STUDENT')}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await expect(new Promise((res, rej) => { s.on('connect', () => res(null)); s.on('connect_error', (e) => rej(e)); })).rejects.toThrow('UNAUTHENTICATED');
  });

  it('authorised students receive live positions; unrelated users receive nothing and cannot subscribe', async () => {
    const trip = await freshTrip(h);
    const ok = await open(tokenFor(h.seed.studentR1, 'STUDENT'));
    const okBus = await open(tokenFor(h.seed.studentBus1, 'STUDENT'));
    const admin = await open(tokenFor(h.seed.adminA, 'ADMIN'));
    const otherStudent = await open(tokenFor(h.seed.studentR2, 'STUDENT'));
    const unassigned = await open(tokenFor(h.seed.studentNone, 'STUDENT'));
    const otherDriver = await open(tokenFor(h.seed.driver2, 'DRIVER'));
    const otherCampus = await open(tokenFor(h.seed.adminB, 'ADMIN', h.seed.campusB));
    const lurker = await open(tokenFor(h.seed.studentR1, 'STUDENT')); // authorised user who never subscribes

    expect((await sub(ok, h.seed.bus1)).ok).toBe(true);
    expect((await sub(okBus, h.seed.bus1)).ok).toBe(true);
    expect((await sub(admin, h.seed.bus1)).ok).toBe(true);
    expect(await sub(otherStudent, h.seed.bus1)).toEqual({ ok: false, error: 'NOT_AUTHORIZED_FOR_BUS' });
    expect(await sub(unassigned, h.seed.bus1)).toEqual({ ok: false, error: 'NOT_AUTHORIZED_FOR_BUS' });
    expect(await sub(otherDriver, h.seed.bus1)).toEqual({ ok: false, error: 'NOT_AUTHORIZED_FOR_BUS' });
    expect(await sub(otherCampus, h.seed.bus1)).toEqual({ ok: false, error: 'BUS_NOT_FOUND' });
    expect(await sub(ok, 'bad-id')).toEqual({ ok: false, error: 'BUS_NOT_FOUND' });

    const gots = [ok, okBus, admin, otherStudent, unassigned, otherDriver, otherCampus, lurker].map(collect);
    const res = await report(trip.id, ev(h, -500, 28.4611, 77.0277));
    expect(res.body.results[0].appliedToLive).toBe(true);
    await wait(400);
    expect(gots.map((g) => g.length)).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    expect(gots[0]![0]).toMatchObject({ busId: h.seed.bus1, lat: 28.4611, lng: 77.0277, freshness: 'LIVE' });
  });

  it('does not deliver events that were rejected, duplicated or older than the live position', async () => {
    const trip = await freshTrip(h);
    const s = await open(tokenFor(h.seed.studentR1, 'STUDENT'));
    await sub(s, h.seed.bus1);
    const got = collect(s);
    const e = ev(h, -500, 28.4611, 77.0277);
    await report(trip.id, e);
    await report(trip.id, e);                                             // duplicate
    await report(trip.id, ev(h, -3_000, 28.4600, 77.0260));              // older than live
    await report(trip.id, ev(h, 60_000, 28.4650, 77.0300));             // future timestamp
    await wait(400);
    expect(got).toHaveLength(1);
  });

  it('after a reconnect nothing is delivered until the client re-subscribes, and the snapshot carries the latest position', async () => {
    const trip = await freshTrip(h);
    const token = tokenFor(h.seed.studentR1, 'STUDENT');
    const a = await open(token);
    await sub(a, h.seed.bus1);
    a.disconnect();
    await report(trip.id, ev(h, -500, 28.4620, 77.0280));    // while disconnected
    const b = await open(token);                              // new connection, new socket id, no rooms
    const got = collect(b);
    await report(trip.id, ev(h, -300, 28.4621, 77.0281));
    await wait(300);
    expect(got).toHaveLength(0);
    const resub = await sub(b, h.seed.bus1);
    expect(resub.ok).toBe(true);
    expect(resub.snapshot).toMatchObject({ freshness: 'LIVE', position: { lat: 28.4621, lng: 77.0281 } });
    await report(trip.id, ev(h, -100, 28.4622, 77.0282));
    await wait(300);
    expect(got.map((g) => g.lat)).toEqual([28.4622]);
  });

  it('unsubscribe stops delivery; a connection is closed when its access token expires', async () => {
    const trip = await freshTrip(h);
    const s = await open(tokenFor(h.seed.studentR1, 'STUDENT'));
    await sub(s, h.seed.bus1);
    const got = collect(s);
    s.emit('unsubscribe:bus', { busId: h.seed.bus1 });
    await wait(150);
    await report(trip.id, ev(h, -500, 28.4630, 77.0290));
    await wait(300);
    expect(got).toHaveLength(0);

    const short = await open(tokenFor(h.seed.studentR1, 'STUDENT', h.seed.campusA, 2));
    const closed = new Promise<string>((r) => short.on('disconnect', (reason) => r(reason)));
    expect(await Promise.race([closed, wait(4_000).then(() => 'still-open')])).toBe('io server disconnect');
  });
});
