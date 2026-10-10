import { buildPgSsl } from './tls';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { seedInitialData, seedPostgresData } from './index';

const { Pool } = pg;

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('⚠️ No DATABASE_URL provided. Migration skipped for external database.');
    process.exit(0);
  }

  console.log('Running PostgreSQL database schema migration...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: buildPgSsl(process.env, dbUrl),
  });

  const client = await pool.connect();
  try {
    const possibleSchemaPaths = [
      path.join(process.cwd(), 'server', 'db', 'schema.sql'),
      path.join(process.cwd(), 'schema.sql'),
    ];
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      possibleSchemaPaths.unshift(path.join(currentDir, 'schema.sql'));
    } catch {}
    try {
      if (typeof __dirname !== 'undefined') {
        possibleSchemaPaths.unshift(path.join(__dirname, 'schema.sql'));
      }
    } catch {}

    const schemaPath = possibleSchemaPaths.find((p) => fs.existsSync(p));
    if (!schemaPath) {
      throw new Error(`schema.sql not found in candidate paths: ${possibleSchemaPaths.join(', ')}`);
    }

    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await client.query(sql);
    console.log(`✅ PostgreSQL schema successfully applied from ${schemaPath}.`);

    // Check if initial colleges exist
    const res = await client.query('SELECT COUNT(*) as count FROM colleges');
    if (parseInt(res.rows[0].count, 10) === 0) {
      console.log('Seeding initial college & fleet records...');
      await seedInitialData();
      await seedPostgresData(client);
    }
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
