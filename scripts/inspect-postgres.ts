// Read-only inventory. Reports schema metadata and aggregate counts only.
import { createPostgresPool } from '../apps/api/src/infra/postgres/pool';

async function main() {
  const pool = await createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5s'");
      const identity = await client.query(`
        SELECT current_database() AS database,
          current_setting('server_version') AS server_version,
          ssl, version AS tls_version
        FROM pg_stat_ssl WHERE pid = pg_backend_pid()
      `);
      console.log('Connection', identity.rows[0]);
      const tables = await client.query<{ schema: string; name: string; qualified_name: string; columns: string[] }>(`
        SELECT n.nspname AS schema, c.relname AS name, format('%I.%I', n.nspname, c.relname) AS qualified_name,
          ARRAY(SELECT a.attname::text FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
          AND n.nspname NOT IN ('information_schema', 'pg_catalog')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY n.nspname, c.relname
      `);
      for (const table of tables.rows) {
        // The catalog quotes both identifiers with PostgreSQL's %I formatter.
        const { rows: [{ count }] } = await client.query(`SELECT count(*) FROM ${table.qualified_name}`);
        console.log(JSON.stringify({ schema: table.schema, table: table.name, count, columns: table.columns }));
      }
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: { code?: string }) => {
  console.error('Database inspection failed', error?.code ?? 'CHECK_CONNECTION_OR_TLS_SETTINGS');
  process.exitCode = 1;
});
