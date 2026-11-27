import http from 'http';
import pg from 'pg';
import { createServices } from '../src/compose';
import { DEFAULT_TRACKING, type TrackingConfig } from '../src/config/env';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import { newId } from '../src/infra/postgres/ids';
import { applyV1Schema } from '../src/infra/postgres/pool';
import { createPostgresRepositories, type Repositories } from '../src/infra/postgres/repositories';
import { createApp } from '../src/http/app';
import { createGateway } from '../src/realtime/gateway';
import type { Principal, Role } from '../src/domain/types';

export const PG_TEST_URL = process.env.PG_TEST_URL;
if (process.env.CI_REQUIRE_INTEGRATION && !PG_TEST_URL) {
  throw new Error('PG_TEST_URL is required in CI');
}
export const SECRET = 'test-secret-test-secret-test-secret-123456';
export const REFRESH_SECRET = 'refresh-secret-refresh-secret-refresh-123456';
export const T0 = new Date('2026-10-11T10:00:00.000Z');
export const id = newId;

export interface Harness {
  pool: pg.Pool; connectionString: string;
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
  if (!PG_TEST_URL) throw new Error('PG_TEST_URL is not set');
  const url = new URL(PG_TEST_URL);
  if (!url.pathname.endsWith('_test') || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('PG_TEST_URL must target a disposable loopback PostgreSQL database with a name ending in _test');
  }
  const dbName = `campusbus_test_${newId()}`;
  const control = new pg.Pool({ connectionString: url.href, max: 1 });
  let created = false;
  let pool: pg.Pool | undefined;
  let closeGateway: (() => Promise<void>) | undefined;
  const close = async () => {
    try {
      await closeGateway?.();
    } finally {
      try {
        await pool?.end();
        if (created) await control.query(`DROP DATABASE "${dbName}"`);
      } finally {
        await control.end();
      }
    }
  };

  try {
    await control.query(`CREATE DATABASE "${dbName}"`);
    created = true;
    url.pathname = `/${dbName}`;
    const connectionString = url.href;
    pool = new pg.Pool({ connectionString });
    await applyV1Schema(pool);
    const repos = createPostgresRepositories(pool);
    const seed = await seedData(repos);

    let current = new Date(T0);
    const clock = { now: () => new Date(current), set: (d: Date) => { current = new Date(d); }, advance: (ms: number) => { current = new Date(current.getTime() + ms); } };
    const config: TrackingConfig = { ...DEFAULT_TRACKING, ...overrides };
    const emitted: Harness['emitted'] = [];

    // The emitter is wired to the gateway after the HTTP server exists; until then (and always) we record emissions.
    let forward: (c: string, b: string, p: unknown) => void = () => {};
    const emitter = { emitLocation: (c: string, b: string, p: unknown) => { emitted.push({ campusId: c, busId: b, payload: p }); forward(c, b, p); } };
    const testEnv = { ...process.env, ACCESS_TOKEN_SECRET: SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv;
    const services = createServices(repos, config, emitter, undefined, { env: testEnv, accessTtlSeconds: 900, refreshTtlDays: 30, emailVerificationRequired: false, emailTokenTtlMinutes: 60, resetTokenTtlMinutes: 20, rateLimitLoginAttempts: 100, rateLimitWindowMs: 60_000 }, clock.now);
    const verifyToken = (t: string) => verifyAccessToken(t, SECRET);
    const app = createApp({
      ingest: services.ingest, trips: services.trips, live: services.live, auth: services.auth,
      users: repos.users, buses: repos.buses, routes: repos.routes, tripRepo: repos.trips,
      ...services.extraRepos,
      verifyToken, verifyActiveAccount: true, allowedOrigins: [],
    });
    const server = http.createServer(app);
    const gateway = createGateway(server, { verifyToken, live: services.live, allowedOrigins: [] });
    closeGateway = () => gateway.close();
    forward = (c, b, p) => gateway.emitter.emitLocation(c, b, p);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Harness did not bind to TCP');
    const origin = `http://127.0.0.1:${address.port}`;

    return {
      pool, connectionString, services, app, server, url: origin, emitted, clock, seed,
      token: (u, ttl) => signAccessToken({ userId: u.id, campusId: u.campusId, role: u.role }, SECRET, ttl),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function seedData(repos: Repositories): Promise<Seed> {
  const { id: campusA } = await repos.campuses.create({ name: 'Campus A', shortCode: 'CAMPA', city: 'A', lat: 1, lng: 2, zoom: 15, timezone: 'UTC' });
  const { id: campusB } = await repos.campuses.create({ name: 'Campus B', shortCode: 'CAMPB', city: 'B', lat: 3, lng: 4, zoom: 15, timezone: 'UTC' });
  const mk = async (campusId: string, role: Role, name: string, busId: string | null = null, routeId: string | null = null) => {
    const user = await repos.users.create({ campusId, email: `${name}@example.test`, passwordHash: 'x', name, role, status: 'ACTIVE' });
    if (busId || routeId) await repos.users.assignTransport(campusId, user.id, busId, routeId);
    return user.id;
  };
  const { id: route1 } = await repos.routes.create({ campusId: campusA, code: 'R1', name: 'Route 1', color: '#2563eb', stops: [] });
  const { id: route2 } = await repos.routes.create({ campusId: campusA, code: 'R2', name: 'Route 2', color: '#2563eb', stops: [] });
  const driver1 = await mk(campusA, 'DRIVER', 'driver1');
  const driver2 = await mk(campusA, 'DRIVER', 'driver2');
  const driverFree = await mk(campusA, 'DRIVER', 'driverfree');
  const driverB = await mk(campusB, 'DRIVER', 'driverb');
  const bus = (number: string, driverId: string | null, routeId: string | null) =>
    repos.buses.create({ campusId: campusA, number, capacity: 40, status: 'ACTIVE', driverId, routeId });
  const { id: bus1 } = await bus('B1', driver1, route1);
  const { id: bus2 } = await bus('B2', driver2, route2);
  const { id: busNoRoute } = await bus('B3', null, null);
  return {
    campusA, campusB, route1, route2, bus1, bus2, busNoRoute, driver1, driver2, driverFree, driverB,
    adminA: await mk(campusA, 'ADMIN', 'admina'), adminB: await mk(campusB, 'ADMIN', 'adminb'),
    studentR1: await mk(campusA, 'STUDENT', 'studentr1', null, route1),
    studentR2: await mk(campusA, 'STUDENT', 'studentr2', null, route2),
    studentBus1: await mk(campusA, 'STUDENT', 'studentbus1', bus1),
    studentNone: await mk(campusA, 'STUDENT', 'studentnone'),
  };
}

// ---- helpers for tests ----
export const P = (h: Harness, userId: string, role: Role, campusId = h.seed.campusA): Principal => ({ userId, campusId, role });

export async function freshTrip(h: Harness, driverKey: 'driver1' | 'driver2' = 'driver1') {
  const driverId = h.seed[driverKey];
  const busId = driverKey === 'driver1' ? h.seed.bus1 : h.seed.bus2;
  const previous = await h.services.repos.trips.findActiveByBus(h.seed.campusA, busId);
  if (previous) await h.services.repos.trips.end(h.seed.campusA, previous.id, h.clock.now(), 'CANCELLED');
  await h.pool.query('DELETE FROM v1.vehicle_locations WHERE bus_id = $1', [busId]);
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
