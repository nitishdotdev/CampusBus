/**
 * One-time initial administrator provisioning.
 *
 * Requires: DATABASE_URL, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts --campus-id <24hex> --email <email> --name <name>
 *
 * Password is read from ADMIN_PASSWORD (never pass it on the command line).
 * Refuses to run if an administrator already exists for the campus.
 */
import 'dotenv/config';
import pg from 'pg';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../apps/api/src/auth/service';
import { createPostgresRepositories } from '../apps/api/src/infra/postgres/repositories';
import { applyV1Schema } from '../apps/api/src/infra/postgres/pool';
import { buildPgConnection } from '../server/db/tls';
import { ConsoleEmailSender } from '../apps/api/src/infra/email/stub';

function arg(name: string): string {
  const idx = process.argv.indexOf(name);
  const value = idx >= 0 ? process.argv[idx + 1] : '';
  if (!value || value.startsWith('--')) {
    console.error(`Missing required argument: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const campusId = arg('--campus-id');
  const email = arg('--email');
  const name = arg('--name');
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    console.error('ADMIN_PASSWORD must be set in the environment');
    process.exit(1);
  }
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pgConn = buildPgConnection(process.env, DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: pgConn.connectionString,
    ssl: pgConn.ssl,
    max: 4,
  });

  try {
    await applyV1Schema(pool);
    const repos = createPostgresRepositories(pool);
    const auth = new AuthService({
      users: repos.users,
      campuses: repos.campuses,
      refreshTokens: repos.refreshTokens,
      emailTokens: repos.emailTokens,
      email: new ConsoleEmailSender(),
      config: { ...DEFAULT_AUTH_CONFIG, env: process.env },
    });
    const user = await auth.bootstrapAdmin(campusId, email, password, name);
    console.info(`Created administrator ${user.email} (${user.userId}) for campus ${user.campusId}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  const code = err?.code ?? err?.message ?? String(err);
  console.error(`bootstrap-admin failed: ${code}`);
  process.exit(1);
});
