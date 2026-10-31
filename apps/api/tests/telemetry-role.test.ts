import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { Principal } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const DRIVER_ID = '2'.repeat(24);
const STUDENT_ID = '3'.repeat(24);
const ADMIN_ID = '4'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';

function token(p: Principal) {
  return signAccessToken(p, SECRET);
}

function makeApp() {
  const ingestCalls: unknown[] = [];
  const app = createApp({
    ingest: {
      ingest: async (principal: Principal, body: unknown) => {
        ingestCalls.push({ principal, body });
        return { tripId: 't', results: [] };
      },
    },
    trips: { start: async () => ({}), end: async () => ({}) },
    live: { snapshot: async () => ({}) },
    auth: {} as any,
    users: {} as any,
    buses: {} as any,
    routes: {},
    tripRepo: {},
    verifyToken: (t: string) => verifyAccessToken(t, SECRET),
    allowedOrigins: [],
  } as any);
  return { app, ingestCalls };
}

const body = { tripId: 'b'.repeat(24), events: [{ eventId: 'evt_abcd12', lat: 28.4, lng: 77.0, capturedAt: '2026-10-11T10:00:00.000Z' }] };

describe('POST /api/v1/telemetry role gate', () => {
  it('refuses students and admins with DRIVER_ROLE_REQUIRED and does not ingest', async () => {
    const { app, ingestCalls } = makeApp();
    for (const [id, role] of [[STUDENT_ID, 'STUDENT'], [ADMIN_ID, 'ADMIN']] as const) {
      const res = await request(app)
        .post('/api/v1/telemetry')
        .set('Authorization', `Bearer ${token({ userId: id, campusId: CAMPUS, role })}`)
        .send(body);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('DRIVER_ROLE_REQUIRED');
    }
    expect(ingestCalls).toHaveLength(0);
  });

  it('allows an authenticated driver through to ingest', async () => {
    const { app, ingestCalls } = makeApp();
    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('Authorization', `Bearer ${token({ userId: DRIVER_ID, campusId: CAMPUS, role: 'DRIVER' })}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(ingestCalls).toHaveLength(1);
  });
});
