# PostgreSQL, migration and rollback

The active API uses the `v1` schema in PostgreSQL. Tables for campus, accounts, tokens, operations, and GPS are defined in [schema.sql](../apps/api/src/infra/postgres/schema.sql). The default workflow and the integration harness use the same repositories. Keep test and production databases separate.

## Upgrade an existing v1 database

1. Confirm the target service and database from the hosting dashboards. Record the active application revision, database branch, and a backup or point-in-time recovery marker. Take a schema and row-count inventory for both `v1` and any historical schemas without copying private records into logs.
2. Restore to a staging database or use an isolated provider branch. Configure `DATABASE_URL`, any private CA, and `DATABASE_SSL_MODE=verify` in the runner's secret store.
3. Run `NODE_ENV=production npm run db:migrate` twice. The migrator runs in a transaction under a PostgreSQL advisory lock. This release adds complaint storage, trip stop snapshots, occupancy, optional bus metadata, and campus settings. It does not drop or reset rows.
4. Compare row counts, primary keys, assignment relationships, and login for existing accounts. Start a new trip, verify GPS and stop advancement, end it, and validate complaint ownership and resolution. Stop snapshots apply to newly started trips. Plan the rollout between shifts if existing active trips need uninterrupted stop tracking.
5. After review and deployment approval, apply the same migration to the confirmed production database. Verify health, campus list, CORS and one authorized account per role.

Existing `v1` IDs remain stable. New optional metadata can be null. Existing trip passenger counts remain unknown until there is recorded data. The service never imports old records implicitly.

## Legacy data decision

A deployed v1 service was observed, but database inventory access was unavailable. Any data in the older non-v1 schema needs a separately staged import with explicit campus, user, vehicle, route and record ID mappings. The v1 schema uses compact identifiers, different relationships and campus-scoped email uniqueness. Do not copy historical complaints, assignments or trips into v1 without reconciling those relationships. Retain the historical implementation and schema reference until inventory and parity have been verified.

## Rollback

Revert the application to the previously healthy Render and Vercel revisions. Leave additive database objects in place so records created during the release are preserved. Verify old entry points and row counts on staging first. Use a backup restore only for a verified data incident through the database provider's recovery workflow, with explicit reconciliation of writes since the restore point. Do not drop the v1 schema or the newly written complaints.

The local TLS suite checks a dedicated private CA and rejects identity and chain mismatches. Local PostgreSQL tests create uniquely named child databases and clean up those databases. A caller-supplied database name is never used as the drop target.
