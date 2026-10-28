import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadAllowedOrigins } from '../src/config/env';
import { createApp, type AppDeps } from '../src/http/app';
import { buildCorsOptions } from '../../../server/config/cors';

const APPROVED = 'https://campusmove.vercel.app';
const EVIL = 'https://evil.example.net';

function stubApp(origins: string[], role: 'ADMIN' | null = 'ADMIN') {
  const dummy = async () => { throw new Error('unused'); };
  const bus = { id: '1'.repeat(24), campusId: 'a'.repeat(24), number: 'B1', capacity: 40, status: 'ACTIVE' as const, driverId: null, routeId: null };
  return createApp({
    ingest: { ingest: dummy } as unknown as AppDeps['ingest'],
    trips: { start: dummy, end: dummy } as unknown as AppDeps['trips'],
    live: { snapshot: dummy } as unknown as AppDeps['live'],
    auth: { login: dummy, register: dummy, refresh: dummy, logout: dummy, logoutAll: dummy } as unknown as AppDeps['auth'],
    users: { findById: async () => null, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), updateStatus: async () => false, assignTransport: async () => false } as unknown as AppDeps['users'],
    buses: {
      list: async () => ({ items: [bus], total: 1, page: 1, pageSize: 25 }),
      findById: async () => bus,
      create: dummy,
      update: async (_c: string, _id: string, patch: Partial<typeof bus>) => ({ ...bus, ...patch }),
      delete: async () => false,
      assignDriver: async () => bus,
      assignRoute: async () => bus,
    } as unknown as AppDeps['buses'],
    routes: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), findById: async () => null, create: dummy, update: async () => null, delete: async () => false } as unknown as AppDeps['routes'],
    tripRepo: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) } as unknown as AppDeps['tripRepo'],
    verifyToken: () => (role ? { userId: '4'.repeat(24), campusId: 'a'.repeat(24), role } : null),
    allowedOrigins: origins,
  });
}

describe('loadAllowedOrigins (production fail-closed)', () => {
  it('does not default to localhost when CORS_ORIGIN is missing in production', () => {
    const origins = loadAllowedOrigins({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(origins).toEqual([]);
    expect(origins.some((o) => o.includes('localhost'))).toBe(false);
  });
  it('rejects malformed and wildcard production configuration', () => {
    expect(() => loadAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: '*' } as NodeJS.ProcessEnv)).toThrow(/Wildcard/);
    expect(() => loadAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'not a url' } as NodeJS.ProcessEnv)).toThrow(/invalid origin/);
    expect(() => loadAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'http://example.com' } as NodeJS.ProcessEnv)).toThrow(/HTTPS/);
  });
  it('allows an explicitly configured Vercel origin', () => {
    expect(loadAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: APPROVED } as NodeJS.ProcessEnv)).toEqual([APPROVED]);
  });
  it('uses localhost only in non-production when CORS_ORIGIN is unset', () => {
    const origins = loadAllowedOrigins({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(origins).toContain('http://localhost:5173');
  });
});

describe('v1 CORS PATCH and origin policy', () => {
  it('allows PATCH preflight from an approved origin with credentials and Authorization', async () => {
    const app = stubApp([APPROVED]);
    const res = await request(app)
      .options(`/api/v1/buses/${'1'.repeat(24)}`)
      .set('Origin', APPROVED)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Authorization,Content-Type');
    expect(res.headers['access-control-allow-origin']).toBe(APPROVED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers['access-control-allow-methods'] ?? '')).toMatch(/PATCH/);
    expect(String(res.headers['access-control-allow-headers'] ?? '').toLowerCase()).toMatch(/authorization/);
  });

  it('allows an actual PATCH admin update from the approved origin', async () => {
    const app = stubApp([APPROVED]);
    const res = await request(app)
      .patch(`/api/v1/buses/${'1'.repeat(24)}`)
      .set('Origin', APPROVED)
      .set('Authorization', 'Bearer t')
      .send({ status: 'MAINTENANCE' });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(APPROVED);
    expect(res.body.status).toBe('MAINTENANCE');
  });

  it('does not grant a disallowed origin on preflight or the actual request', async () => {
    const app = stubApp([APPROVED]);
    const pre = await request(app)
      .options(`/api/v1/buses/${'1'.repeat(24)}`)
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const actual = await request(app)
      .patch(`/api/v1/buses/${'1'.repeat(24)}`)
      .set('Origin', EVIL)
      .set('Authorization', 'Bearer t')
      .send({ status: 'MAINTENANCE' });
    expect(actual.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('buildCorsOptions includes PATCH without opening origins', () => {
    const opts = buildCorsOptions([APPROVED]);
    expect(opts.methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']));
    expect(opts.credentials).toBe(true);
  });
});
