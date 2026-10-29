/**
 * apps/api standalone entry point.
 * Usage:  tsx apps/api/src/server.ts
 *         node dist/api.cjs
 *
 * Required env: MONGODB_URI, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
 * Optional env: PORT (default 4000), CORS_ORIGIN (comma-separated), BOOTSTRAP_SECRET
 */
import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { z } from 'zod';
import { loadTrackingConfig } from './config/env';
import { requireAccessSecret } from './auth/tokens';
import { verifyAccessToken } from './auth/tokens';
import { createServices } from './compose';
import { DomainError } from './domain/errors';
import type { CampusRepository, LiveEmitter } from './domain/types';
import { createApp } from './http/app';
import { createModels, ensureIndexes } from './infra/mongo/models';
import { createRepositories } from './infra/mongo/repositories';
import { createGateway } from './realtime/gateway';
import { resolveAllowedOrigins } from '../../../server/config/cors';

// ── Validate required env vars early ─────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('FATAL: MONGODB_URI is required'); process.exit(1); }

const PORT           = Number(process.env.PORT ?? 4000);
const ALLOWED_ORIGINS = resolveAllowedOrigins();
const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET ?? '';
const trackingConfig   = loadTrackingConfig(process.env);

// Validate token secrets (throws with a clear message if missing/short)
const accessSecret = requireAccessSecret(process.env);

// ── MongoDB connection ────────────────────────────────────────────────────────
const conn = mongoose.createConnection(MONGODB_URI, {
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  tls: process.env.NODE_ENV === 'production',
});
conn.on('error',        (err) => console.error('[mongodb] error', err.message));
conn.on('connected',    ()    => console.info('[mongodb] connected'));
conn.on('disconnected', ()    => console.warn('[mongodb] disconnected'));

// ── Start-up ──────────────────────────────────────────────────────────────────
async function main() {
  await conn.asPromise();

  const models = createModels(conn);
  await ensureIndexes(models);

  // Stable emitter proxy — the real emitter is attached after Socket.IO starts
  let _emit: LiveEmitter['emitLocation'] = () => {};
  const emitterProxy: LiveEmitter = {
    emitLocation: (campusId, busId, payload) => _emit(campusId, busId, payload),
  };

  const services = createServices(
    models,
    trackingConfig,
    emitterProxy,
    undefined, // email — ConsoleEmailSender used by default
    { env: process.env },
  );

  // Campus repo (needed for the public /campuses routes added below)
  const campuses: CampusRepository = services.repos.campuses;

  // ── Express app ─────────────────────────────────────────────────────────────
  const app = createApp({
    ingest:    services.ingest,
    trips:     services.trips,
    live:      services.live,
    auth:      services.auth,
    users:     services.repos.users,
    buses:     services.repos.buses,
    routes:    services.repos.routes,
    tripRepo:  services.repos.trips,
    verifyToken: (t) => verifyAccessToken(t, accessSecret),
    allowedOrigins: ALLOWED_ORIGINS,
    ...services.extraRepos,
  });

  // ── Campus routes (public list + admin bootstrap) ────────────────────────────
  const campusBody = z.object({
    name:      z.string().min(2).max(120),
    shortCode: z.string().min(2).max(16),
    city:      z.string().max(120).default(''),
    lat:       z.number().min(-90).max(90),
    lng:       z.number().min(-180).max(180),
    zoom:      z.number().int().min(1).max(20).default(15),
    timezone:  z.string().max(50).default('UTC'),
  }).strict();

  app.get('/api/v1/campuses', async (_req, res) => {
    res.json(await campuses.list());
  });

  // Bootstrap: creates the first campus (requires x-bootstrap-secret header)
  app.post('/api/v1/campuses', async (req, res) => {
    if (!BOOTSTRAP_SECRET || req.headers['x-bootstrap-secret'] !== BOOTSTRAP_SECRET) {
      res.status(403).json({ error: 'FORBIDDEN' }); return;
    }
    const body = campusBody.parse(req.body);
    res.status(201).json(await campuses.create(body));
  });

  // ── HTTP server + Socket.IO ──────────────────────────────────────────────────
  const httpServer = http.createServer(app);

  const { emitter } = createGateway(httpServer, {
    verifyToken: (t) => verifyAccessToken(t, accessSecret),
    live: services.live,
    allowedOrigins: ALLOWED_ORIGINS,
  });
  // Wire the real emitter into our proxy (safe: no events can arrive until listen() completes)
  _emit = emitter.emitLocation.bind(emitter);

  httpServer.listen(PORT, () => {
    console.info(`[api] listening on :${PORT}`);
    console.info(`[api] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.info(`[api] simulation: ${trackingConfig.simulationEnabled ? 'ON' : 'off'}`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.info(`[api] ${signal} — shutting down`);
    httpServer.close(async () => {
      await conn.close();
      console.info('[api] shutdown complete');
      process.exit(0);
    });
    // Force-exit if clean shutdown stalls
    setTimeout(() => { console.error('[api] forced exit'); process.exit(1); }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => { console.error('[api] startup failed:', err.message); process.exit(1); });
