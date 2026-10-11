# Implementation status

Branch `feature/mern-rebuild`. Nothing has been pushed, merged, deployed, or run against production.

## Cycle log

### Cycle 1 (commit `e6a1867`)
Fixed malformed nav JSX and the schedule/complaint wiring from the "WIP" commit, removed the hardcoded JWT fallback, made production refuse the silent file-database fallback, patched `source-map-js`, added `scripts/inspect-postgres.ts`.

### Cycle 2 (commits `57895a3`, `bc8ed49`)
- CORS allowlist for REST and Socket.IO (`server/config/cors.ts`), used by `server.ts`, `api/index.ts`, `server/socket.ts`.
- Analytics: invented constants removed (`getAnalytics`, `adminService.getFleetStats`, `DriverHistory`); unmeasured values are `null`.
- PostgreSQL TLS: `server/db/tls.ts`, verification always on, host-bound identity check.
- Schedules and complaints tables added to `server/db/schema.sql` (they were never created by `migrate.ts` or `initDatabase`, so any real PostgreSQL deploy would have failed on those routes).
- Vitest, supertest, GitHub Actions workflow (`.github/workflows/ci.yml`), docs (`REFERENCE_AUDIT`, `ARCHITECTURE`, `DATABASE`, `SECURITY`, `MIGRATION_PLAN`).
- `scripts/verify-all.ts`: added a setup step that ends any pre-existing active trip for the test driver. Assertions are unchanged.

### Cycle 3 (this session; commits listed in `git log`)
- **apps/api** (new, strict TypeScript, not connected to the legacy app): ports and domain services, connection-bound Mongoose models for 10 collections, Mongo repositories, secure GPS ingestion, live snapshot/freshness, Express app factory, authenticated Socket.IO gateway, access tokens. Details: `GPS_TRACKING.md`, `DATABASE.md`.
- **PostgreSQL TLS rebuilt** (`server/db/tls.ts`, `buildPgConnection`) after testing showed URL `sslmode` parameters override code, IP-literal hosts were checked against `localhost`, and the URL parser reads files named in `sslrootcert`. Render-specific modes added from Render's documentation. `render.yaml` now sets `DATABASE_SSL_MODE=encrypt-private`.
- **CI** now has PostgreSQL 16 and MongoDB 7 service containers, a separate TLS Postgres with a private CA, and a guard test that fails when integration suites would be skipped. **CI has not been run** (nothing is pushed).
- `.env.example` corrected (it listed a `mongodb://` URL as `DATABASE_URL` while the legacy code needs PostgreSQL) and extended.
- Test environment: no real MongoDB is obtainable in the sandbox, so Mongo tests ran on **FerretDB 1.24** over PostgreSQL. Designed to avoid features it lacks (TTL, partial indexes, transactions).

## Commands run and actual results (2026-10-11, sandbox)
| Command | Result |
|---|---|
| `npm run lint` (app + strict apps/api) | pass |
| `npm run build` | pass |
| `npm test` with every integration variable set (FerretDB, local Postgres, local TLS Postgres) | 13 files, **113 passed, 0 failed** |
| `npm test` with no services (as a bare checkout) | 49 passed, 64 skipped |
| `CI_REQUIRE_INTEGRATION=1` with no services | guard fails (4 failed) as intended |
| `npm run test:verify`, 2 runs, first from an empty store | 53/53 each |
| `scripts/test-prod-hardening.ts` | 4/4 |
| `npm audit` | 0 vulnerabilities |
| CI workflow and `render.yaml` | parsed as valid YAML only; **not executed** |

Of the 113: 63 are in `apps/api/tests` (policy, tokens, GPS authorization, integrity, live access, sockets, models, persistence), the rest are root tests (CORS, TLS, analytics, JWT secret, PostgreSQL schema, TLS integration, CI guard).

Mutation checks: 33 deliberate breakages of security-critical rules were applied one at a time; the two survivors that mattered led to a new test and a fix to the freshness rule (position age now uses the earlier of capture and receipt time). Final survivors: none that are not equivalent mutants.

Caveats
- Mongo results are FerretDB, not MongoDB.
- Nothing in apps/api is used by the frontend or by the running server.
- `test:verify` still exercises the legacy file-backed store only.

## Checklist (evidence-based)
- [x] Build, lint, type-check pass; hardcoded JWT fallback removed; no silent production DB fallback; CORS allowlist; fabricated analytics removed; audit clean (cycles 1-2)
- [x] PostgreSQL TLS cannot be weakened by URL parameters or config for public hosts (unit + real-server tests)
- [x] Secure GPS ingestion (apps/api): auth, assignment, trip state, server-controlled simulation, untrusted timestamps, no invented speed, validation, idempotency, ordering, late sync, rate limit (integration-tested on FerretDB)
- [x] Socket.IO authentication and per-subscription authorization, reconnect and token expiry behaviour (tested)
- [x] Mongoose models, constraints, pagination, retention purge, persistence across reconnects (FerretDB)
- [x] CI covers real Postgres, Mongo, TLS Postgres (**written, not run**)
- [ ] Verified on real MongoDB: **not established** (needs CI run or a Mongo instance)
- [ ] Production data inspection: **BLOCKED** on the sanitized output of `scripts/inspect-postgres.ts`
- [ ] Login, refresh tokens, Argon2id, email verification and reset in apps/api: not started
- [ ] CRUD APIs (buses, routes, stops, schedules, assignments, users, notifications, emergencies, audit writing) in apps/api: not started (models exist)
- [ ] Frontend on apps/api, IndexedDB queue tests, Leaflet live map, ETA: not started
- [ ] Playwright end-to-end journey: not started
- [ ] Monorepo split (`apps/web`, own package.json for `apps/api`): not started
- [ ] Telemetry retention job scheduled: not started (purge function exists)
- [ ] Backups, deployment runbooks for Atlas/Render/Vercel: not started

## Blockers
1. Sanitized production inspection output (user runs the read-only script locally).
2. A real MongoDB (CI run, or a local `mongod`) to confirm results obtained on FerretDB.
3. Render: confirm the internal-URL setting (`encrypt-private`) and whether the external certificate verifies; must be tested in staging, not production.

## Needs your attention before any deploy of this branch
- Production will refuse to start unless `DATABASE_SSL_MODE` fits the URL (`encrypt-private` for Render's internal URL, `verify` for external). `render.yaml` carries the internal setting, but a manually configured Render service must be updated by you.
- `render.yaml` runs `npm run db:migrate` during the build; I did not verify that Render's build environment can reach the private-network database. Check this in staging.

## Next highest-priority task
Authentication in apps/api (login, refresh rotation with reuse detection, Argon2id with migration of bcrypt hashes, email verification/reset, rate limits, audit events), then admin CRUD for buses/routes/stops/assignments, then switch the driver and student frontends to the new API behind a flag.

## Handoff
```
git checkout feature/mern-rebuild
npm ci && npm run lint && npm test && npm run build
# integration suites (disposable services only):
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```
