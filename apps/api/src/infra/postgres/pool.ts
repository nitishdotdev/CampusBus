import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { CampusNotProvisionedError } from '../../domain/errors';
import { buildPgConnection } from './tls';

export async function createPostgresPool(env: NodeJS.ProcessEnv = process.env): Promise<pg.Pool> {
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('FATAL: DATABASE_URL is required');
    throw new Error('FATAL: DATABASE_URL is required');
  }
  const conn = buildPgConnection(env, url);
  const pool = new pg.Pool({
    connectionString: conn.connectionString,
    ssl: conn.ssl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

// Liveness: the database answers. Deliberately independent of campus data so an
// unprovisioned campus never makes the infrastructure health check fail.
// Pool checkout has its own deadline on the server pool. Share concurrent probes.
export function databaseReadiness(pool: pg.Pool): () => Promise<void> {
  const query = { text: 'SELECT 1', query_timeout: 1_000 };
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= pool.query(query).then(() => {}).finally(() => { pending = undefined; });
    return pending;
  };
}

// Operational readiness: at least one campus row exists in v1.campuses. Fails with
// CampusNotProvisionedError when the table is empty, so a missing bootstrap is visible
// through /readyz instead of looking like a healthy service with an empty login screen.
export function campusProvisioningReadiness(pool: pg.Pool): () => Promise<void> {
  const query = { text: 'SELECT EXISTS (SELECT 1 FROM v1.campuses) AS provisioned', query_timeout: 1_000 };
  return async () => {
    const { rows } = await pool.query<{ provisioned: boolean }>(query);
    if (!rows[0]?.provisioned) throw new CampusNotProvisionedError();
  };
}

export async function withTransaction<T>(pool: pg.Pool, execute: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await execute(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyV1Schema(pool: pg.Pool): Promise<void> {
  await withTransaction(pool, async client => {
    // One v1 migrator per database, including concurrent Render starts.
    await client.query('SELECT pg_advisory_xact_lock(476201, 1)');
    await client.query(loadSchemaSql());
  });
}

function loadSchemaSql(): string {
  const candidates = [
    path.join(process.cwd(), 'apps/api/src/infra/postgres/schema.sql'),
    path.join(process.cwd(), 'dist', 'schema.sql'),
  ];
  try {
    candidates.unshift(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'));
  } catch {
    /* bundled cjs has no import.meta */
  }
  try {
    if (typeof __dirname !== 'undefined') candidates.unshift(path.join(__dirname, 'schema.sql'));
  } catch {
    /* ignore */
  }
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`v1 schema.sql not found in ${candidates.join(', ')}`);
  return fs.readFileSync(found, 'utf8');
}
