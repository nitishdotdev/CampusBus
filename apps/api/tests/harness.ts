import http from 'http';
import mongoose, { Types } from 'mongoose';
import { createServices } from '../src/compose';
import { DEFAULT_TRACKING, type TrackingConfig } from '../src/config/env';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import { createModels, ensureIndexes, type Models } from '../src/infra/mongo/models';
import { createApp } from '../src/http/app';
import { createGateway } from '../src/realtime/gateway';
import type { Principal, Role } from '../src/domain/types';

export const MONGO_URI = process.env.MONGODB_TEST_URI; // e.g. mongodb://127.0.0.1:27017 (a disposable server, never production)
export const SECRET = 'test-secret-test-secret-test-secret-123456';
export const REFRESH_SECRET = 'refresh-secret-refresh-secret-refresh-123456';
export const T0 = new Date('2026-10-11T10:00:00.000Z');
export const id = () => new Types.ObjectId().toString();

export interface Harness {
  models: Models; conn: mongoose.Connection; dbName: string;
  services: ReturnType<typeof createServices>;
  app: ReturnType<typeof createApp>;
  server: http.Server; url: string;
  emitted: { campusId: string; busId: string; payload: any }[];
  clock: { now: () => Date; set: (d: Date) => void; advance: (ms: number) => void };
  seed: Seed;
  token: (u: { id: string; campusId: string; role: Role }, ttl?: number) => string;
  close: () => Promise<void>;
}
export interface Seed {
  campusA: string; campusB: string;
  route1: string; route2: string; bus1: string; bus2: string; busNoRoute: string;
  adminA: string; adminB: string; driver1: string; driver2: string; driverFree: string; driverB: string;
  studentR1: string; studentR2: string; studentBus1: string; studentNone: string;
}

export async function createHarness(overrides: Partial<TrackingConfig> = {}): Promise<Harness> {
  if (!MONGO_URI) throw new Error('MONGODB_TEST_URI is not set');
  const dbName = `cm_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const conn = await mongoose.createConnection(`${MONGO_URI.replace(/\/$/, '')}/${dbName}`).asPromise();
  const models = createModels(conn);
  await ensureIndexes(models);

  let current = new Date(T0);
  const clock = { now: () => new Date(current), set: (d: Date) => { current = new Date(d); }, advance: (ms: number) => { current = new Date(current.getTime() + ms); } };
  const config: TrackingConfig = { ...DEFAULT_TRACKING, ...overrides };
  const emitted: Harness['emitted'] = [];

  // The emitter is wired to the gateway after the HTTP server exists; until then (and always) we record emissions.
  let forward: (c: string, b: string, p: unknown) => void = () => {};
  const emitter = { emitLocation: (c: string, b: string, p: unknown) => { emitted.push({ campusId: c, busId: b, payload: p }); forward(c, b, p); } };
  const testEnv = { ...process.env, ACCESS_TOKEN_SECRET: SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv;
  const services = createServices(models, config, emitter, undefined, { env: testEnv, accessTtlSeconds: 900, refreshTtlDays: 30, emailVerificationRequired: false, emailTokenTtlMinutes: 60, resetTokenTtlMinutes: 20, rateLimitLoginAttempts: 100, rateLimitWindowMs: 60_000 }, clock.now);
  const repos = services.repos;
  const verifyToken = (t: string) => verifyAccessToken(t, SECRET);
  const app = createApp({
    ingest: services.ingest, trips: services.trips, live: services.live, auth: services.auth,
    users: repos.users, buses: repos.buses, routes: repos.routes, tripRepo: repos.trips,
    verifyToken, allowedOrigins: [],
  });
  const server = http.createServer(app);
  const gateway = createGateway(server, { verifyToken, live: services.live, allowedOrigins: [] });
  forward = (c, b, p) => gateway.emitter.emitLocation(c, b, p);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;

  const seed = await seedData(models);
  const harness: Harness = {
    models, conn, dbName, services, app, server, url, emitted, clock, seed,
    token: (u, ttl) => signAccessToken({ userId: u.id, campusId: u.campusId, role: u.role } as Principal, SECRET, ttl),
    close: async () => {
      await gateway.close();
      await harness.conn.dropDatabase(); // harness.conn may have been replaced by a test that restarts the connection
      await harness.conn.close();
    },
  };
  return harness;
}

async function seedData(m: Models): Promise<Seed> {
  const campusA = id(), campusB = id();
  const mk = (campusId: string, role: Role, n: string, extra: Record<string, unknown> = {}) =>
    m.User.create({ campusId, email: `${n}@example.test`, passwordHash: 'x', name: n, role, status: 'ACTIVE', ...extra }).then((u) => String(u._id));
  const route1 = String((await m.Route.create({ campusId: campusA, code: 'R1', name: 'Route 1', stops: [] }))._id);
  const route2 = String((await m.Route.create({ campusId: campusA, code: 'R2', name: 'Route 2', stops: [] }))._id);
  const driver1 = await mk(campusA, 'DRIVER', 'driver1');
  const driver2 = await mk(campusA, 'DRIVER', 'driver2');
  const driverFree = await mk(campusA, 'DRIVER', 'driverfree');
  const driverB = await mk(campusB, 'DRIVER', 'driverb');
  const bus1 = String((await m.Bus.create({ campusId: campusA, number: 'B1', capacity: 40, driverId: driver1, routeId: route1 }))._id);
  const bus2 = String((await m.Bus.create({ campusId: campusA, number: 'B2', capacity: 40, driverId: driver2, routeId: route2 }))._id);
  const busNoRoute = String((await m.Bus.create({ campusId: campusA, number: 'B3', capacity: 40 }))._id);
  return {
    campusA, campusB, route1, route2, bus1, bus2, busNoRoute, driver1, driver2, driverFree, driverB,
    adminA: await mk(campusA, 'ADMIN', 'admina'), adminB: await mk(campusB, 'ADMIN', 'adminb'),
    studentR1: await mk(campusA, 'STUDENT', 'studentr1', { assignedRouteId: route1 }),
    studentR2: await mk(campusA, 'STUDENT', 'studentr2', { assignedRouteId: route2 }),
    studentBus1: await mk(campusA, 'STUDENT', 'studentbus1', { assignedBusId: bus1 }),
    studentNone: await mk(campusA, 'STUDENT', 'studentnone'),
  };
}

// ---- helpers for tests ----
export const P = (h: Harness, userId: string, role: Role, campusId = h.seed.campusA): Principal => ({ userId, campusId, role });

export async function freshTrip(h: Harness, driverKey: 'driver1' | 'driver2' = 'driver1') {
  const driverId = h.seed[driverKey];
  const busId = driverKey === 'driver1' ? h.seed.bus1 : h.seed.bus2;
  await h.models.Trip.updateMany({ busId, status: 'ACTIVE' }, { $set: { status: 'CANCELLED', endedAt: h.clock.now() }, $unset: { activeBusKey: 1, activeDriverKey: 1 } });
  await h.models.VehicleLocation.deleteMany({ busId });
  h.emitted.length = 0;
  const trip = await h.services.trips.start(P(h, driverId, 'DRIVER'), { busId });
  h.clock.advance(60_000); // events in tests are captured shortly BEFORE "now" but must fall after the trip start
  return trip;
}

let seq = 0;
export function ev(h: Harness, offsetMs: number, lat = 28.4595, lng = 77.0266, extra: Record<string, unknown> = {}) {
  seq += 1;
  return { eventId: `evt_${Date.now().toString(36)}_${seq}`, lat, lng, capturedAt: new Date(h.clock.now().getTime() + offsetMs).toISOString(), ...extra };
}
