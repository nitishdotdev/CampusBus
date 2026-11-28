/**
 * apps/api standalone entry point.
 * Usage:  tsx apps/api/src/server.ts
 *         node dist-api/api.cjs
 *
 * Required env: DATABASE_URL, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
 * Optional env: PORT (default 4000), CORS_ORIGIN (comma-separated), BOOTSTRAP_SECRET, DATABASE_SSL_MODE
 */
import 'dotenv/config';
import http from 'http';
import pg from 'pg';
import { loadTrackingConfig } from './config/env';
import { requireAccessSecret } from './auth/tokens';
import { verifyAccessToken } from './auth/tokens';
import { createServices } from './compose';
import type { LiveEmitter } from './domain/types';
import { createApp } from './http/app';
import { applyV1Schema, campusProvisioningReadiness, databaseReadiness } from './infra/postgres/pool';
import { createPostgresRepositories } from './infra/postgres/repositories';
import { createGateway } from './realtime/gateway';
import { resolveAllowedOrigins } from './config/cors';
import { buildPgConnection } from './infra/postgres/tls';
import { createEmailSender } from './infra/email/resend';
import { bootstrapAdminOnStartup } from './bootstrap/startupAdmin';

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
  connectionTimeoutMillis: 1_000,
  idleTimeoutMillis: 30_000,
});
pool.on('error', () => console.error('[postgres] Idle database connection lost.'));

async function main() {
  const email = createEmailSender(process.env);
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
    email,
    { env: process.env },
  );

  const bootstrap = await bootstrapAdminOnStartup(process.env, repos.campuses, services.auth);
  if (bootstrap === 'email-in-use') console.warn('[bootstrap] administrator not created: the bootstrap email already belongs to another account');
  else if (bootstrap !== 'disabled') console.info(`[bootstrap] administrator ${bootstrap}`);

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
    isSessionActive: (sid) => services.auth.isSessionActive(sid),
    verifyActiveAccount: true,
    checkReadiness: databaseReadiness(pool),
    checkCampusProvisioning: campusProvisioningReadiness(pool),
    trustProxy: process.env.RENDER === 'true' ? 1 : undefined,
    allowedOrigins: ALLOWED_ORIGINS,
    bootstrapSecret: BOOTSTRAP_SECRET,
    ...services.extraRepos,
  });

  const httpServer = http.createServer(app);

  const { emitter } = createGateway(httpServer, {
    verifyToken: (t) => verifyAccessToken(t, accessSecret),
    isSessionActive: (sid) => services.auth.isSessionActive(sid),
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
