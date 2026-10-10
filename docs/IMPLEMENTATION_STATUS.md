# Implementation status

Branch `feature/mern-rebuild`. Nothing has been pushed, merged, deployed, or run against production.

## Cycle log

### Cycle 1 (commit `e6a1867`)
Fixed malformed nav JSX and the schedule/complaint wiring from the "WIP" commit, removed the hardcoded JWT fallback, made production refuse the silent file-database fallback, patched `source-map-js`, added `scripts/inspect-postgres.ts`.

### Cycle 2 (commit `57895a3` plus the commit that follows it)
- CORS allowlist for REST and Socket.IO (`server/config/cors.ts`), used by `server.ts`, `api/index.ts`, `server/socket.ts`.
- Analytics: invented constants removed (`getAnalytics`, `adminService.getFleetStats`, `DriverHistory`); unmeasured values are `null`.
- PostgreSQL TLS: `server/db/tls.ts`, verification always on, host-bound identity check.
- Schedules and complaints tables added to `server/db/schema.sql` (they were never created by `migrate.ts` or `initDatabase`, so any real PostgreSQL deploy would have failed on those routes).
- Vitest, supertest, GitHub Actions workflow (`.github/workflows/ci.yml`), docs (`REFERENCE_AUDIT`, `ARCHITECTURE`, `DATABASE`, `SECURITY`, `MIGRATION_PLAN`).
- `scripts/verify-all.ts`: added a setup step that ends any pre-existing active trip for the test driver. Assertions are unchanged.

## Commands run and actual results (2026-10-10, sandbox)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run build` | pass (large-chunk warning only) |
| `npm test` (default, as in CI) | 23 passed, 7 skipped (integration suites need external services) |
| `npm test` with all integration env set (real TLS Postgres + scratch Postgres) | 30 passed, 0 failed |
| `npm run test:verify` against a dev server, 4 consecutive runs, first from an empty store | 53/53 each time |
| `npx tsx scripts/test-prod-hardening.ts` | 4/4 |
| `npm audit` | 0 vulnerabilities |
| Production boot with no `JWT_SECRET` | exits with FATAL (manual check) |

Mutation check done: replacing the CORS origin check with "allow all" makes 3 CORS tests fail.

Caveats on those numbers:
- `test:verify` uses the file-backed store, not PostgreSQL or MongoDB.
- The integration suites ran against a Postgres 16 installed in this sandbox. They have not run in CI (no Postgres service configured yet) and have not run against Render.
- The earlier "53/53 production ready" memory was wrong for the original HEAD. On a fresh store the original suite gave 50/53 (seed data leaves active trips for demo drivers).

## Checklist (evidence-based)
- [x] Existing build errors fixed (lint and build pass)
- [x] Hardcoded JWT-secret fallback removed (`tests/auth-secret.test.ts`, boot check)
- [x] No silent file fallback in production (`test-prod-hardening.ts`)
- [x] CORS allowlist (`tests/cors.test.ts`)
- [x] Fabricated analytics removed (`tests/analytics.test.ts`)
- [x] PostgreSQL TLS verified (`tests/tls.test.ts`, `tests/pg-tls.integration.test.ts`)
- [x] Dependency audit clean
- [x] CI workflow written (**not yet run on GitHub**, since nothing is pushed)
- [ ] Production data inspection: **BLOCKED** (needs `DATABASE_URL`; run `scripts/inspect-postgres.ts`)
- [ ] MongoDB models and repository: not started
- [ ] Argon2id, refresh tokens, email verification, reset: not started
- [ ] GPS ingest authorization, idempotency, ordering, staleness: not started (gaps listed in `ARCHITECTURE.md` section 2)
- [ ] Socket.IO per-room authorization tests: not started
- [ ] Offline queue tests (IndexedDB): not started
- [ ] Playwright journeys: not started
- [ ] Monorepo split: not started
- [ ] Deployment configs (Render/Vercel/Atlas), backups, runbooks: not started

## Blockers
1. Production database inspection output (see `MIGRATION_PLAN.md` step 0).
2. Render PostgreSQL TLS behavior is unknown. Before this branch is ever deployed, test the connection in staging and set `DATABASE_SSL_MODE` / `DATABASE_CA_CERT` as needed.

## Next highest-priority task
Stage 2 first slice: introduce a repository interface over `db`, then add Mongoose models and a Mongo repository behind it, tested against a disposable MongoDB. After that, rebuild GPS ingest with the authorization/idempotency/ordering gaps closed.

Also pending small items: add a Postgres service to CI so the integration suites run there; remove `api/index.ts` once the Render service is the API; fix the `'college_apex'` default in `adminService`.

## Handoff
```
git checkout feature/mern-rebuild
npm ci && npm run lint && npm test && npm run build
# integration suites (optional, need disposable Postgres; never production):
PG_TEST_URL=postgres://user@localhost:5432/scratch npm test
```
