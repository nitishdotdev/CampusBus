/**
 * apps/api standalone entry point.
 * Usage:  tsx apps/api/src/server.ts
 *         node dist/api.cjs
 *
 * Required env: DATABASE_URL, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
 * Optional env: PORT (default 4000), CORS_ORIGIN (comma-separated), BOOTSTRAP_SECRET, DATABASE_SSL_MODE
 */
import 'dotenv/config';
import http from 'http';
import pg from 'pg';
import { z } from 'zod';
import { loadTrackingConfig } from './config/env';
import { requireAccessSecret } from './auth/tokens';
import { verifyAccessToken } from './auth/tokens';
import { createServices } from './compose';
import type { CampusRepository, LiveEmitter } from './domain/types';
import { createApp } from './http/app';
import { applyV1Schema } from './infra/postgres/pool';
import { createPostgresRepositories } from './infra/postgres/repositories';
import { createGateway } from './realtime/gateway';
import { resolveAllowedOrigins } from '../../../server/config/cors';
import { buildPgConnection } from '../../../server/db/tls';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('FATAL: DATABASE_URL is required'); process.exit(1); }

const PORT            = Number(process.env.PORT ?? 4000);
const ALLOWED_ORIGINS = resolveAllowedOrigins();
const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET ?? '';
const trackingConfig   = loadTrackingConfig(process.env);
const accessSecret     = requireAccessSecret(process.env);

const pgConn = buildPgConnection(process.env, DATABASE_URL);
const pool = new pg.Pool({
  connectionString: pgConn.connectionString,
  ssl: pgConn.ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

async function main() {
  await applyV1Schema(pool);
  console.info('[postgres] v1 schema ready');

  let _emit: LiveEmitter['emitLocation'] = () => {};
  const emitterProxy: LiveEmitter = {
    emitLocation: (campusId, busId, payload) => _emit(campusId, busId, payload),
  };

  const repos = createPostgresRepositories(pool);
  const services = createServices(
    repos,
    trackingConfig,
    emitterProxy,
    undefined,
    { env: process.env },
  );

  const campuses: CampusRepository = services.repos.campuses;

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

  app.post('/api/v1/campuses', async (req, res) => {
    if (!BOOTSTRAP_SECRET || req.headers['x-bootstrap-secret'] !== BOOTSTRAP_SECRET) {
      res.status(403).json({ error: 'FORBIDDEN' }); return;
    }
    const body = campusBody.parse(req.body);
    res.status(201).json(await campuses.create(body));
  });

  const httpServer = http.createServer(app);

  const { emitter } = createGateway(httpServer, {
    verifyToken: (t) => verifyAccessToken(t, accessSecret),
    live: services.live,
    allowedOrigins: ALLOWED_ORIGINS,
  });
  _emit = emitter.emitLocation.bind(emitter);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.info(`[api] listening on 0.0.0.0:${PORT}`);
    console.info(`[api] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.info(`[api] simulation: ${trackingConfig.simulationEnabled ? 'ON' : 'off'}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[api] ${signal} — shutting down`);
    httpServer.close(async () => {
      await pool.end();
      console.info('[api] shutdown complete');
      process.exit(0);
    });
    setTimeout(() => { console.error('[api] forced exit'); process.exit(1); }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => { console.error('[api] startup failed:', err.message); process.exit(1); });
