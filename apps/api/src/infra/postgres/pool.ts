import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { buildPgConnection } from '../../../../../server/db/tls';

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

export async function applyV1Schema(pool: pg.Pool): Promise<void> {
  await pool.query(loadSchemaSql());
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
