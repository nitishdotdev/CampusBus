import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import http from 'http';
import request from 'supertest';
import { resolveAllowedOrigins, buildCorsOptions } from '../server/config/cors';
import { initSocketIO } from '../server/socket';

const APPROVED = 'https://campusmove.example.com';
const EVIL = 'https://evil.example.net';

describe('resolveAllowedOrigins', () => {
  it('rejects wildcard in every environment', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'development', CORS_ORIGIN: '*' } as any)).toThrow(/Wildcard/);
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: '*' } as any)).toThrow(/Wildcard/);
  });
  it('requires https for non-local origins in production', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'http://example.com' } as any)).toThrow(/HTTPS/);
    expect(resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: APPROVED } as any)).toEqual([APPROVED]);
  });
  it('rejects origins with paths and malformed values', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: `${APPROVED}/app` } as any)).toThrow(/bare origins/);
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'not a url' } as any)).toThrow(/invalid origin/);
  });
  it('is same-origin only in production when unset, localhost list in development', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'production' } as any)).toEqual([]);
    expect(resolveAllowedOrigins({ NODE_ENV: 'development' } as any)).toContain('http://localhost:5173');
  });
  it('normalizes trailing slashes and whitespace', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: ` ${APPROVED}/ , https://b.example.com ` } as any))
      .toEqual([APPROVED, 'https://b.example.com']);
  });
});

describe('Express CORS middleware', () => {
  const app = express();
  app.use(cors(buildCorsOptions([APPROVED])));
  app.get('/ping', (_req, res) => res.json({ ok: true }));

  it('echoes an approved origin with credentials', async () => {
    const res = await request(app).get('/ping').set('Origin', APPROVED);
    expect(res.headers['access-control-allow-origin']).toBe(APPROVED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
  it('does not grant an unapproved origin', async () => {
    const res = await request(app).get('/ping').set('Origin', EVIL);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
  it('denies preflight for an unapproved origin and allows it for an approved one', async () => {
    const bad = await request(app).options('/ping').set('Origin', EVIL).set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const good = await request(app).options('/ping').set('Origin', APPROVED).set('Access-Control-Request-Method', 'POST');
    expect(good.headers['access-control-allow-origin']).toBe(APPROVED);
  });
  it('allows PATCH preflight from an approved origin', async () => {
    const res = await request(app)
      .options('/ping')
      .set('Origin', APPROVED)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Authorization,Content-Type');
    expect(res.headers['access-control-allow-origin']).toBe(APPROVED);
    expect(String(res.headers['access-control-allow-methods'] ?? '')).toMatch(/PATCH/);
  });
  it('still serves non-browser requests without an Origin header', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});

describe('Socket.IO CORS', () => {
  const server = http.createServer();
  let base = '';
  beforeAll(async () => {
    initSocketIO(server, [APPROVED]);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => { server.close(); });

  const poll = (origin: string) =>
    fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origin } });

  it('grants the approved origin', async () => {
    const res = await poll(APPROVED);
    expect(res.headers.get('access-control-allow-origin')).toBe(APPROVED);
  });
  it('does not grant an unapproved origin', async () => {
    const res = await poll(EVIL);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
