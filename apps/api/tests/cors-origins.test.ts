import cors from 'cors';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildCorsOptions, resolveAllowedOrigins } from '../../../server/config/cors';
import { createApp } from '../src/http/app';

const APPROVED = 'https://campus-move-one.vercel.app';
const LOCAL = 'http://localhost:5173';
const EVIL = 'https://evil.example.net';

describe('apps/api production origin policy', () => {
  it('does not silently enable localhost when CORS_ORIGIN is absent in production', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('preserves a configured Vercel origin', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: APPROVED } as NodeJS.ProcessEnv)).toEqual([APPROVED]);
  });

  it('rejects malformed CORS_ORIGIN in production', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'not a url' } as NodeJS.ProcessEnv)).toThrow(/invalid origin/);
  });

  it('keeps localhost defaults only in development when CORS_ORIGIN is unset', () => {
    const origins = resolveAllowedOrigins({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(origins).toContain(LOCAL);
  });

  it('createApp PATCH preflight succeeds for an approved origin and fails for others', async () => {
    const app = createApp({
      ingest: {} as any, trips: {} as any, live: {} as any, auth: {} as any,
      users: {} as any, buses: {} as any, routes: {} as any, tripRepo: {} as any,
      verifyToken: () => null,
      allowedOrigins: resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: APPROVED } as NodeJS.ProcessEnv),
    });
    const good = await request(app)
      .options('/api/v1/users/aaaaaaaaaaaaaaaaaaaaaaaa/status')
      .set('Origin', APPROVED)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');
    expect(good.headers['access-control-allow-origin']).toBe(APPROVED);
    const methods = (good.headers['access-control-allow-methods'] ?? '').toUpperCase();
    expect(methods.split(',').map((m: string) => m.trim())).toContain('PATCH');

    const bad = await request(app)
      .options('/api/v1/users/aaaaaaaaaaaaaaaaaaaaaaaa/status')
      .set('Origin', LOCAL)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();

    const evil = await request(app)
      .options('/api/v1/users/aaaaaaaaaaaaaaaaaaaaaaaa/status')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('empty production allowlist does not echo localhost', async () => {
    const app = express();
    app.use(cors(buildCorsOptions(resolveAllowedOrigins({ NODE_ENV: 'production' } as NodeJS.ProcessEnv))));
    app.patch('/x', (_req, res) => res.json({ ok: true }));
    const res = await request(app)
      .options('/x')
      .set('Origin', LOCAL)
      .set('Access-Control-Request-Method', 'PATCH');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
