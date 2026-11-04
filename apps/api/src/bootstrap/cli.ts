/**
 * Trusted one-time campus (and optional first-admin) provisioner.
 * Usage:
 *   npx tsx apps/api/src/bootstrap/cli.ts --name="Apex State University" --short-code=ASU --lat=34.0537 --lng=-118.257
 *   npm run api:bootstrap -- --name="Apex State University" --short-code=ASU --lat=34.0537 --lng=-118.257
 *
 * Optional first admin:
 *   --admin-email=admin@campus.edu --admin-password=ChangeMe123! --admin-name="Campus Admin"
 *
 * Required env: DATABASE_URL
 */
import 'dotenv/config';
import pg from 'pg';
import { loadTrackingConfig } from '../config/env';
import { createServices } from '../compose';
import { applyV1Schema } from '../infra/postgres/pool';
import { createPostgresRepositories } from '../infra/postgres/repositories';
import { buildPgConnection } from '../../../../server/db/tls';
import { provisionCampus } from './provisionCampus';

function flag(name: string, envName: string, fallback = ''): string {
  const prefix = `--${name}=`;
  const fromArg = process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  return (fromArg || process.env[envName] || fallback).trim();
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is required');
    process.exit(1);
  }

  const name = flag('name', 'CAMPUS_NAME');
  const shortCode = flag('short-code', 'CAMPUS_SHORT_CODE');
  const city = flag('city', 'CAMPUS_CITY');
  const lat = Number(flag('lat', 'CAMPUS_LAT', 'NaN'));
  const lng = Number(flag('lng', 'CAMPUS_LNG', 'NaN'));
  const zoom = Number(flag('zoom', 'CAMPUS_ZOOM', '15'));
  const timezone = flag('timezone', 'CAMPUS_TIMEZONE', 'UTC');
  const adminEmail = flag('admin-email', 'BOOTSTRAP_ADMIN_EMAIL');
  const adminPassword = flag('admin-password', 'BOOTSTRAP_ADMIN_PASSWORD');
  const adminName = flag('admin-name', 'BOOTSTRAP_ADMIN_NAME', 'Campus Admin');

  if (!name || !shortCode || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('Usage: npm run api:bootstrap -- --name="Campus" --short-code=ABC --lat=34.05 --lng=-118.25');
    process.exit(1);
  }

  const pgConn = buildPgConnection(process.env, DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: pgConn.connectionString,
    ssl: pgConn.ssl,
    max: 4,
    idleTimeoutMillis: 10_000,
  });

  try {
    await applyV1Schema(pool);
    const repos = createPostgresRepositories(pool);
    const result = await provisionCampus(repos.campuses, {
      name, shortCode, city, lat, lng, zoom, timezone,
    });
    const verb = result.created ? 'created' : 'already exists';
    console.info(`[bootstrap] campus ${verb}: ${result.campus.shortCode} ${result.campus.id}`);

    if (adminEmail && adminPassword) {
      const services = createServices(
        repos,
        loadTrackingConfig(process.env),
        { emitLocation: () => {} },
        undefined,
        { env: process.env },
      );
      try {
        const admin = await services.auth.bootstrapAdmin(
          result.campus.id, adminEmail, adminPassword, adminName,
        );
        console.info(`[bootstrap] admin created: ${admin.email} ${admin.userId}`);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ADMIN_ALREADY_EXISTS') {
          console.info('[bootstrap] admin already exists for this campus');
        } else {
          throw err;
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[bootstrap] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
