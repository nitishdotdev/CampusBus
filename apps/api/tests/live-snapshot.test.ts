import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { LiveService } from '../src/domain/live';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { Principal } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const ADMIN_ID = '4'.repeat(24);
const BUS_ID = '1'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';

function token(p: Principal) {
  return signAccessToken(p, SECRET);
}

function unusedDeps() {
  return {
    ingest: { ingest: async () => ({}) },
    trips: { start: async () => ({}), end: async () => ({}) },
    auth: {} as any,
    users: {} as any,
    buses: {},
    routes: {},
    tripRepo: {},
  } as any;
}

describe('GET /api/v1/buses/:id/live', () => {
  it('returns 404 BUS_NOT_FOUND for a non-ObjectId bus id instead of 400', async () => {
    const live = new LiveService({
      users: { findById: async () => ({ id: ADMIN_ID, campusId: CAMPUS, role: 'ADMIN', status: 'ACTIVE' }) } as any,
      buses: { findById: async () => ({ id: BUS_ID, campusId: CAMPUS }) } as any,
      trips: { findActiveByBus: async () => null } as any,
      live: { getByBus: async () => null } as any,
    });
    const app = createApp({
      ...unusedDeps(),
      live,
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
