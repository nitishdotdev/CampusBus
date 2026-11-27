import 'dotenv/config';
import { applyV1Schema, createPostgresPool } from './pool';

const pool = await createPostgresPool();
try {
  await applyV1Schema(pool);
  console.info('CampusBus v1 schema is ready.');
} finally {
  await pool.end();
}
