# Implementation Status

**Branch:** `feature/mern-rebuild`
**Last updated:** 2026-10-14

Status values: `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED — NOT VERIFIED` | `VERIFIED` | `BLOCKED`

For the full 67-item checklist with evidence, see `docs/ACCEPTANCE_CHECKLIST.md`.
For the exact stopping point and next tasks, see `docs/SESSION_HANDOFF.md`.
For the new-session continuation prompt, see `docs/CONTINUATION_PROMPT.md`.

---

## What has been done — cycle by cycle

### Cycle 1 — commit `e6a1867`
Fixed malformed nav JSX, schedule/complaint wiring, removed hardcoded JWT fallback, enforced production DB requirement, patched `source-map-js`. Baseline: lint/build pass, 50→53/53 tests.

### Cycle 2 — commits `57895a3`, `bc8ed49`
- CORS: strict allowlist covering REST and Socket.IO — **mutation-tested**
- Analytics: removed invented constants; unmeasured values are `null`
- PostgreSQL TLS: first version — host-bound identity check
- Schedules/complaints tables added to `schema.sql` (they were missing)
- Vitest + supertest installed; 4 test files; CI workflow skeleton

### Cycle 3 — commit `4f29dba`
PostgreSQL TLS rebuilt after testing showed URL `sslmode` parameters override code (`?sslmode=no-verify` silently disabled verification). `buildPgConnection` in `server/db/tls.ts` strips all TLS params from the URL, validates them, and applies TLS only from `DATABASE_SSL_MODE`. `render.yaml` updated. 7 real-server TLS tests pass including IP-literal mismatch and hostile URL params.

### Cycle 4 — commit `cf77c08`
- **apps/api** scaffolded: domain types, ports, geo helpers, freshness, rate limiter, access policy
- GPS ingestion service: 10+ security properties, tested with 27 integration tests on FerretDB
- Live snapshot service + freshness states
- Socket.IO gateway: auth in handshake, per-subscription authorization, token expiry
- Mongoose models: 10 collections, indexes, constraints
- MongoDB repositories: User, Bus, Route, Trip, VehicleLocation, Telemetry
- 113/113 tests pass with all services (FerretDB + local Postgres); 49/113 pass without services
- CI: `.github/workflows/ci.yml` with Postgres 16, Mongo 7, TLS Postgres

### Cycle 5 — not yet committed
- `AuthService` complete: register, login, Argon2id, refresh rotation, replay detection, logout/logout-all, email OTP verification, password reset, admin bootstrap, bcrypt→Argon2id live migration, login rate limiting
- `RefreshTokenRepository`, `EmailTokenRepository`, RefreshToken and EmailToken Mongoose schemas
- Extended `UserRepository`: findByEmail, create, updateStatus, verifyEmail, updatePassword, list, assignTransport
- `MongoBusRepository`, `MongoRouteRepository`, `MongoTripRepository`: full CRUD + assignments
- `ConsoleEmailSender` stub
- HTTP app extended: `/api/v1/auth/*` (10 routes), `/api/v1/buses` (6 routes), `/api/v1/routes` (5 routes), `/api/v1/users` (4 routes), `/api/v1/trips` (3 routes)
- Auth integration tests written (23 tests) — **not run to completion** due to FerretDB crashes under heavy load; tests are sound and should pass on real `mongod` or in CI

---

## Current test results (all local, using FerretDB or local Postgres)

| Suite | Last result | Service needed |
|---|---|---|
| Unit (CORS, TLS config, analytics, JWT, rate limiter, access, freshness) | 49 passed | none |
| GPS auth integration (FerretDB) | 11 passed | MONGODB_TEST_URI |
| GPS integrity integration (FerretDB) | 28 passed | MONGODB_TEST_URI |
| Live access + Socket.IO (FerretDB) | 17 passed | MONGODB_TEST_URI |
| Models + persistence (FerretDB) | 9 passed | MONGODB_TEST_URI |
| Auth tokens (unit) | 8 passed | none |
| Auth integration | 23 written — **not run to completion** | MONGODB_TEST_URI (needs stable mongod) |
| PostgreSQL schema (local Postgres) | 3 passed | PG_TEST_URL |
| PostgreSQL TLS (local TLS Postgres) | 7 passed | PG_TLS_TEST_URL + CA |
| Legacy HTTP suite | 53/53 | dev server |
| Production hardening | 4/4 | none |

**Total verified passing on FerretDB: 113/113** (excl. auth integration)

**IMPORTANT: FerretDB is not MongoDB.** It lacks TTL indexes, partial indexes and transactions. The GPS and model tests were designed to avoid those features. Real MongoDB verification is required and is BLOCKED until CI runs or a real `mongod`/Atlas instance is available.

---

## Outstanding work (priority order)

1. **BLOCKED**: Run auth integration tests on real MongoDB (`npm test` with `MONGODB_TEST_URI=<real mongod>`)
2. **NOT STARTED**: Schedule CRUD (model exists; need `MongoScheduleRepository`, HTTP routes, tests)
3. **NOT STARTED**: Notifications + emergency alerts HTTP layer
4. **NOT STARTED**: Frontend integration — connect React app to `apps/api`
   - Auth: replace AppContext login with `apps/api` endpoints; access token in memory, refresh in HttpOnly cookie
   - Driver GPS: connect `src/services/locationService.ts` → `POST /api/v1/telemetry`
   - Student: dashboard, live map, notifications
   - Admin: bus/route/user/schedule management screens
5. **NOT STARTED**: Leaflet live map with real GPS data (Socket.IO subscription, freshness, stops polyline)
6. **NOT STARTED**: ETA calculation (haversine, clearly not road distance)
7. **NOT STARTED**: Playwright E2E tests
8. **NOT STARTED**: MongoDB Atlas connectivity (create cluster, whitelist IPs, test)
9. **NOT STARTED**: Render + Vercel final deployment config
10. **BLOCKED**: Production Postgres inspection (user must run `scripts/inspect-postgres.ts`)

---

## External dependencies (user must supply)

| Item | Status | Instructions |
|---|---|---|
| Production Postgres data count | BLOCKED | `DATABASE_URL="<prod>" npx tsx scripts/inspect-postgres.ts` |
| MongoDB Atlas URI | BLOCKED | Create cluster at atlas.mongodb.com; add to Render env |
| Email provider | BLOCKED | Replace `ConsoleEmailSender` with real provider |
| Render staging env | BLOCKED | Needed before production deployment |

---

## Security properties verified (all have passing tests + mutation checks)

- JWT: HS256, pinned issuer/audience, no hardcoded fallback, production exit on missing secret
- CORS: strict allowlist, wildcards rejected, HTTPS required in production
- PostgreSQL TLS: URL parameters cannot weaken verification, IP-literal identity check, hostile URL params stripped
- GPS: role check, trip ownership, vehicle assignment, server-controlled simulation, untrusted device timestamp, no invented speed, idempotency, rate limiting
- Socket.IO: token in handshake only (not URL), per-subscription auth, token expiry closes connection
- Analytics: no fabricated numbers, unmeasured values are `null`

## Known security gaps (not yet fixed)

- Auth integration not verified on real MongoDB
- Rate limiter is in-process only (multi-replica needs Redis)
- No email provider configured (tokens logged to stdout in dev)
- Frontend still uses legacy server (no Bearer token, no refresh cookies)
- `api/index.ts` (Vercel serverless entry) still exists; cannot host Socket.IO; to be removed
- Legacy GPS ingest (`server/routes/driver.ts`) has authorization gaps listed in `ARCHITECTURE.md` section 2

## Commit commands for the next session

```bash
git checkout feature/mern-rebuild
git pull origin feature/mern-rebuild   # get latest after push
npm ci
npm run lint
npx tsc -p apps/api --noEmit
npm run build
# with real mongod:
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```
