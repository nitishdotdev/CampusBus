// READ-ONLY inspection of the existing PostgreSQL database.
// Prints table row counts, user counts by role and date ranges only.
// It never selects emails, names, passwords, coordinates or any other row content.
//
// Usage:  DATABASE_URL=postgres://... npx tsx scripts/inspect-postgres.ts
import { Pool } from 'pg';

const TABLES = ['colleges', 'users', 'routes', 'stops', 'buses', 'trips', 'locations',
  'notifications', 'emergency_alerts', 'schedules', 'complaints'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    console.error('Set DATABASE_URL to a PostgreSQL connection string.');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 1, options: '-c default_transaction_read_only=on' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    console.log('table                 rows');
    for (const t of TABLES) {
      const exists = (await client.query('SELECT to_regclass($1) AS r', [`public.${t}`])).rows[0].r;
      if (!exists) { console.log(`${t.padEnd(20)}  (missing)`); continue; }
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`${t.padEnd(20)}  ${rows[0].n}`);
    }
    const roles = await client.query('SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role');
    console.log('\nusers by role:', Object.fromEntries(roles.rows.map((r) => [r.role, r.n])));
    for (const [t, col] of [['users', 'created_at'], ['trips', 'start_time'], ['locations', 'timestamp']] as const) {
      try {
        const { rows } = await client.query(`SELECT MIN(${col}) AS first, MAX(${col}) AS last FROM ${t}`);
        console.log(`${t}.${col} range:`, rows[0].first, '->', rows[0].last);
      } catch { /* column may differ; skip */ }
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error('Inspection failed:', e.message); process.exit(1); });
