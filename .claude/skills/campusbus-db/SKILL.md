---
name: campusbus-db
description: Load when editing apps/api/src/infra/postgres/schema.sql, pool.ts, migrate.ts, or repositories.ts.
---
- Schema is v1 only. Legacy server/db/schema.sql is a separate schema. Do not edit it.
- Schema changes are additive: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
- Current behaviour, as-is: applyV1Schema (apps/api/src/infra/postgres/pool.ts) runs at server startup (apps/api/src/server.ts) and in the bootstrap CLI. The db:migrate script runs apps/api/src/infra/postgres/migrate.ts, which does not invoke schema.sql.
- Known discrepancy, not yet resolved: db:migrate does not apply schema.sql. Do not change migration behaviour as part of a feature change. Flag it instead.
- Repositories use parameterised queries through the pool. Revocations use UPDATE ... WHERE revoked_at IS NULL.
- api:build copies schema.sql to dist-api/. Keep that copy working.
