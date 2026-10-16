# PostgreSQL to MongoDB migration plan

Nothing here has been executed. Production has not been touched and will not be without explicit authorization.

## Step 0 — decide whether a migration is needed (blocked on you)
Run the read-only inspection and send the output:
```
DATABASE_URL="<production URL>" npx tsx scripts/inspect-postgres.ts
```
It runs in a read-only transaction and prints table row counts, users by role and date ranges only.

Decision rule:
- Only seeded demo rows (counts equal to the seed data, no users beyond the demo accounts, no trips): no migration; use a clean Atlas initialization plus a bootstrap-admin command.
- Real users or operational records: continue with steps 1 to 6.

## Step 1 — mapping
Target schemas now exist in `apps/api/src/infra/mongo/models` (see `DATABASE.md`). Note two differences from the legacy data: email uniqueness is per campus, and live position is its own collection. When reading the source database use `buildPgConnection` (`DATABASE_SSL_MODE=verify` for Render's external URL; `encrypt-private` only from inside Render's private network).
| PostgreSQL | MongoDB | Notes |
|---|---|---|
| colleges | campuses | `legacyId` kept, unique |
| users | users | bcrypt hash carried over unchanged; rehash to Argon2id on next successful login; `status` mapped to the new approval enum; `student_id`, `cdl_number` kept |
| routes, stops | routes with embedded ordered stops | stop `order` validated unique per route; coordinates become GeoJSON Points |
| buses | buses, plus one `vehicleLocations` doc per bus from `last_location_*` | live position separated from history |
| trips | trips | active trips closed or flagged, since real-time context cannot be resumed |
| locations | telemetry | only rows inside the agreed retention window; the rest summarized or dropped by decision |
| emergency_alerts, notifications | emergencyAlerts, notifications | |
| schedules, complaints | schedules, complaints | tables exist only after this branch's `schema.sql` change; older databases need `CREATE TABLE IF NOT EXISTS` applied first |

Identifiers: new `_id` ObjectIds, old string ids retained as `legacyId` with a unique sparse index, and an in-memory id map used to rewrite references in a second pass.

## Step 2 — script design
`scripts/migrate-pg-to-mongo.ts` (to be written after Step 0):
- Reads PostgreSQL only inside `BEGIN READ ONLY`.
- Writes only to a target URI whose database name must match `*_staging` or `*_migration_test`; refuses otherwise.
- `--dry-run` computes everything and writes nothing.
- Idempotent: upserts by `legacyId`, so reruns do not duplicate.
- Emits `reconciliation-report.json`.

## Step 3 — reconciliation checks
1. Row count per table equals document count per collection (after documented exclusions).
2. Zero orphan references after rewrite (every `busId`, `routeId`, `driverId`, `campusId` resolves).
3. Emails unique after lowercasing; collisions listed, not merged.
4. At most one active trip per bus and per driver.
5. Stop order is a gapless unique sequence per route.
6. Every user's role is one of the allowed values; no account gained a role.
7. Sum of `distance_covered_km` and trip count per route match before and after.

## Step 4 — rehearsal
Restore a copy of the production dump into a disposable PostgreSQL (done the same way as this branch's local TLS test rig), migrate into a staging Atlas database, run the full test suite against it, record results in `IMPLEMENTATION_STATUS.md`.

## Step 5 — cutover (requires your explicit authorization)
Freeze writes, final incremental run, reconciliation, switch the Render service to the Mongo-backed API, smoke-test, keep PostgreSQL read-only for the rollback window.

## Step 6 — rollback
PostgreSQL is untouched throughout, so rollback is redeploying the previous commit with its original environment variables. Anything written to MongoDB after cutover would need to be exported back; decide the rollback window before cutover.
