import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { BusDTO, LastLocationDTO, Principal, UserDTO } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const BUS = 'b'.repeat(24);
const ROUTE = 'c'.repeat(24);
const STUDENT_ON_ROUTE = 'd'.repeat(24);
const STUDENT_OFF_ROUTE = 'e'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';

const lastLocation: LastLocationDTO = {
  tripId: 'f'.repeat(24), lat: 12.97, lng: 77.59, accuracyM: 8, headingDeg: 90, speedMps: 6,
  capturedAt: '2026-11-28T10:00:00.000Z', receivedAt: '2026-11-28T10:00:00.400Z', freshness: 'LIVE',
};

const bus: BusDTO = {
  id: BUS, campusId: CAMPUS, number: 'B-1', capacity: 30, status: 'ACTIVE', driverId: null, routeId: ROUTE,
  activeTrip: { id: lastLocation.tripId, routeId: ROUTE, mode: 'REAL', freshness: 'LIVE' },
  lastLocation,
};

function student(id: string, assignedRouteId: string | null): UserDTO {
  return {
    id, campusId: CAMPUS, email: `${id.slice(0, 4)}@x.test`, name: 'S', role: 'STUDENT', status: 'ACTIVE',
    emailVerifiedAt: new Date(), assignedBusId: null, assignedRouteId,
  };
}

function appFor(users: Record<string, UserDTO>) {
  return createApp({
    ingest: { ingest: async () => ({}) }, trips: { start: async () => ({}), end: async () => ({}) },
    auth: {}, routes: {}, tripRepo: {}, live: {} as any,
    users: { findById: async (_c: string, id: string) => users[id] ?? null } as any,
    buses: {
      list: async () => ({ items: [bus], total: 1, page: 1, pageSize: 50 }),
      findById: async () => bus,
    } as any,
    verifyToken: (t: string) => verifyAccessToken(t, SECRET),
    isSessionActive: async () => true,
    allowedOrigins: [],
  } as any);
}

function token(p: Principal) {
  return signAccessToken(p, SECRET, undefined, 'test-session');
}

describe('persisted bus position in the REST snapshot', () => {
  const users = {
    [STUDENT_ON_ROUTE]: student(STUDENT_ON_ROUTE, ROUTE),
    [STUDENT_OFF_ROUTE]: student(STUDENT_OFF_ROUTE, null),
  };
  const auth = (userId: string) => `Bearer ${token({ userId, campusId: CAMPUS, role: 'STUDENT' })}`;

  it('includes the latest persisted location for a student on the bus route', async () => {
    const res = await request(appFor(users)).get('/api/v1/buses').set('Authorization', auth(STUDENT_ON_ROUTE));
    expect(res.status).toBe(200);
    expect(res.body.items[0].canTrack).toBe(true);
    expect(res.body.items[0].lastLocation).toMatchObject({ lat: 12.97, lng: 77.59, headingDeg: 90, capturedAt: lastLocation.capturedAt });
  });

  it('withholds the position from a student who cannot observe the bus', async () => {
    const res = await request(appFor(users)).get('/api/v1/buses').set('Authorization', auth(STUDENT_OFF_ROUTE));
    expect(res.body.items[0].canTrack).toBe(false);
    expect(res.body.items[0].lastLocation).toBeNull();
  });

  it('applies the same visibility rule to the single-bus endpoint', async () => {
    const allowed = await request(appFor(users)).get(`/api/v1/buses/${BUS}`).set('Authorization', auth(STUDENT_ON_ROUTE));
    expect(allowed.body.lastLocation?.lat).toBe(12.97);
    const denied = await request(appFor(users)).get(`/api/v1/buses/${BUS}`).set('Authorization', auth(STUDENT_OFF_ROUTE));
    expect(denied.body.lastLocation).toBeNull();
  });
});
