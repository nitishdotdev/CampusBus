import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import { DomainError } from '../src/domain/errors';
import { LiveService } from '../src/domain/live';
import type { Principal } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const ADMIN_ID = '4'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';

function token(p: Principal) {
  return signAccessToken(p, SECRET);
}

function unusedDeps() {
  return {
    ingest: { ingest: async () => ({}) },
    trips: { start: async () => ({}), end: async () => ({}) },
    auth: {},
    users: {},
    buses: {},
    routes: {},
    tripRepo: {},
  } as any;
}

describe('GET /api/v1/buses/:id/live', () => {
  it('returns 404 BUS_NOT_FOUND for malformed ids instead of 400', async () => {
    const app = createApp({
      ...unusedDeps(),
      live: {
        snapshot: async (_p: Principal, busId: string) => {
          if (!/^[a-f0-9]{24}$/i.test(busId)) throw new DomainError(404, 'BUS_NOT_FOUND');
          return { busId, freshness: 'UNAVAILABLE', ageMs: null, tripId: null, position: null };
        },
      } as any,
      verifyToken: (t: string) => verifyAccessToken(t, SECRET),
      allowedOrigins: [],
    });

    const res = await request(app)
      .get('/api/v1/buses/nope/live')
      .set('Authorization', `Bearer ${token({ userId: ADMIN_ID, campusId: CAMPUS, role: 'ADMIN' })}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('BUS_NOT_FOUND');
  });
});

describe('LiveService.authorize', () => {
  it('treats malformed bus ids as BUS_NOT_FOUND', async () => {
    const live = new LiveService({
      users: { findById: async () => { throw new Error('must not lookup user'); } } as any,
      buses: { findById: async () => { throw new Error('must not lookup bus'); } } as any,
      trips: { findActiveByBus: async () => null } as any,
      live: { getByBus: async () => null } as any,
    });
    await expect(live.authorize(
      { userId: ADMIN_ID, campusId: CAMPUS, role: 'ADMIN' },
      'nope',
    )).rejects.toMatchObject({ status: 404, code: 'BUS_NOT_FOUND' });
  });
});
