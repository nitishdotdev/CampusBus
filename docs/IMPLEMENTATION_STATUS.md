# Implementation Status

**Branch:** `campusmove-mern-rebuild-d9c7ac4`
**Last updated:** 2026-10-17 (Cycle 7)

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

### Cycle 5 — commit `f7a1aee`
- `AuthService` complete: register, login, Argon2id, refresh rotation, replay detection, logout/logout-all, email OTP verification, password reset, admin bootstrap, bcrypt→Argon2id live migration, login rate limiting
- `RefreshTokenRepository`, `EmailTokenRepository`, RefreshToken and EmailToken Mongoose schemas
- Extended `UserRepository`: findByEmail, create, updateStatus, verifyEmail, updatePassword, list, assignTransport
- `MongoBusRepository`, `MongoRouteRepository`, `MongoTripRepository`: full CRUD + assignments
- `ConsoleEmailSender` stub
- HTTP app extended: `/api/v1/auth/*` (10 routes), `/api/v1/buses` (6 routes), `/api/v1/routes` (5 routes), `/api/v1/users` (4 routes), `/api/v1/trips` (3 routes)
- Auth integration tests written (23 tests) — **not run to completion** due to FerretDB crashes under heavy load; tests are sound and should pass on real `mongod` or in CI

### Cycle 6 — commit `6dc5f20`
- `MongoScheduleRepository`, `MongoNotificationRepository`, `MongoEmergencyAlertRepository`
- HTTP routes: `/api/v1/schedules` (4 routes), `/api/v1/notifications` (3 routes), `/api/v1/alerts` (4 routes)
- `apps/api/tests/crud.integration.test.ts`: 30 tests — buses, routes, schedules, notifications, alerts, user management
- All role authorization server-side (ADMIN for mutations; DRIVER can raise alerts; scoped reads)
- Lint, strict apps/api type-check, and production build all verified passing

### Cycle 7 — (uncommitted at time of writing; see "Commit commands" below)
**Goal: resolve the "auth tests not run to completion" blocker from Cycles 5–6.** It was not an infrastructure
problem — it was two real bugs in `apps/api`, found by actually standing up real services (FerretDB backed by
real PostgreSQL storage, and a TLS-enabled PostgreSQL with a generated private CA) instead of accepting the
"FerretDB crashes under load" diagnosis from the handoff doc.

**Root causes found and fixed:**
1. **`apps/api/src/http/app.ts`, the entire `/api/v1/auth/*` router bypassed the `wrap()` async-error helper.**
   Express 4 does not catch promise rejections from async handlers automatically. Any thrown error in an
   unwrapped handler — a Zod validation failure, a `DomainError` (401/403/409), anything — left the HTTP
   request open with no response, until the test client's timeout fired. This is exactly what tests hitting
   invalid input or auth failures do, so it looked like random hangs/crashes under load. Fixed by routing every
   auth handler through `wrap()`.
2. **`apps/api/src/auth/passwords.ts`, the login path's timing-safe "dummy hash" was a hand-written, invalidly
   encoded argon2 string** (`$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$dummy`). `argon2.verify()` throws
   (`Output is too short`) on malformed input instead of returning `false`, so every login attempt against an
   unknown email threw inside the service layer — one more source of unwrapped-handler hangs/500s. Fixed by (a)
   making `verifyPassword()` defensively catch and treat any malformed-hash error as `{ ok: false }`, and (b)
   replacing the hand-written dummy string with a real argon2 hash computed once via `argon2.hash()` at the
   configured cost (`getDummyHash()`), so the timing-safety property the dummy hash exists for is actually
   intact, not just the right shape.
3. **Two routes in `app.ts` had redundant, less-informative validation ahead of domain logic that already did
   the same check better**, discovered once the above two fixes let the integration suite actually finish and
   surface wrong assertions instead of timeouts: `GET /api/v1/buses/:id/live` called `idParam.parse()`, which
   400s on a malformed bus id, when `LiveService.authorize()` already (and correctly, matching the Socket.IO
   gateway) treats a malformed id the same as a nonexistent one (404 `BUS_NOT_FOUND`); `POST /api/v1/telemetry`
   had `requireRole('DRIVER')` middleware, which pre-empted `TelemetryIngestService.ingest()`'s own role check
   that throws a more specific `DRIVER_ROLE_REQUIRED` (vs. the middleware's generic `FORBIDDEN`). Removed both
   redundant checks so the domain layer's correct, already-tested behavior is reachable.
4. **One test itself was wrong**, also only discoverable once the suite could run to completion:
   `password reset: valid OTP changes hash...` asserted zero live refresh tokens *after* logging in again with
   the new password — but a successful login always issues a new refresh token, so that assertion could never
   pass. Fixed by asserting zero-alive immediately after the reset (before the new login) and asserting
   exactly-one-alive after it.

**Verification performed this cycle (real services, not mocks):**
- Downloaded FerretDB v1.24.0 directly (GitHub release asset; `fastdl.mongodb.org` is not reachable through this
  sandbox's proxy allowlist, confirming the handoff's note that FerretDB was used because a true `mongod`/Atlas
  binary could not be fetched here either) and ran it against the sandbox's local PostgreSQL 16 as its storage
  backend — i.e. two real server processes, not test doubles.
- Generated a private CA and a `CN=localhost` server certificate with `openssl`, enabled `ssl=on` on the local
  PostgreSQL server, and ran `tests/pg-tls.integration.test.ts` against it for the first time in any session —
  6/7 passing (the 7th needs a second DNS name pointing at the same server, optional).
- `MONGODB_TEST_URI=mongodb://127.0.0.1:27017 PG_TEST_URL=... PG_TLS_TEST_URL=... PG_TLS_TEST_CA_FILE=... npx vitest run --no-file-parallelism`: **170 passed, 5 skipped** (the 5 are `ci-guard`'s "is X configured" meta-assertions, which only run under `CI_REQUIRE_INTEGRATION=1`, plus the one optional wrong-DNS TLS test).
- `apps/api/tests/auth.integration.test.ts` alone: **29/29**, 2.02s (previously: never completed).
- `npm run lint`, `npx tsc -p apps/api --noEmit`, `npm run build`: all clean, re-verified after every change.
- Legacy suite (`npm run test:verify` against a running `tsx server.ts` dev server): **53/53**, re-verified unchanged.
- `npx tsx scripts/test-prod-hardening.ts`: **4/4**, re-verified unchanged.
- `npm audit`: **0 vulnerabilities**, re-verified unchanged.

**Also fixed:** a stale branch name (`feature/mern-rebuild`) left over from before the repository was re-uploaded
under `campusmove-mern-rebuild-d9c7ac4` was still referenced in `README.md` and six files under `docs/`
(`SECURITY.md`, `SESSION_HANDOFF.md`, `CONTINUATION_PROMPT.md`, `IMPLEMENTATION_STATUS.md`, `HOW_TO_PUSH.md`,
`ACCEPTANCE_CHECKLIST.md`) — every "what to run first" / "git checkout" instruction in those docs pointed at a
branch that does not exist on this remote. Corrected throughout.

**What Cycle 7 did not change:** no new feature surface, no schema changes, no routes added or removed in
behavior (only in which layer enforces a rule, per item 3 above). This was entirely a correctness/testability
cycle on work Cycles 4–6 had already written.

**Still outstanding after this cycle** (see `docs/ACCEPTANCE_CHECKLIST.md` for the full list): frontend
integration with `apps/api` (nothing in `src/` talks to the new backend yet — this is now the single largest
remaining gap), Leaflet live map, ETA, IndexedDB offline queue wired to the new API, Playwright E2E, a true
`mongod`/MongoDB Atlas run (FerretDB was sufficient to unblock and validate the application logic itself, but
still differs from real MongoDB — no TTL indexes, no partial indexes, no transactions), GitHub Actions CI
actually run, production Postgres data inspection (needs user-supplied access), and deployment configuration.

---

## Current test results (Cycle 7 — all local, using FerretDB/local Postgres/TLS Postgres)

| Suite | Last result | Service needed |
|---|---|---|
| Unit (CORS, TLS config, analytics, JWT, rate limiter, access, freshness) | passed | none |
| GPS auth integration (FerretDB) | 11 passed | MONGODB_TEST_URI |
| GPS integrity integration (FerretDB) | 28 passed | MONGODB_TEST_URI |
| Live access + Socket.IO (FerretDB) | 17 passed | MONGODB_TEST_URI |
| Models + persistence (FerretDB) | 9 passed | MONGODB_TEST_URI |
| Auth tokens (unit) | 8 passed | none |
| **Auth integration** | **29/29 passed** (2.02s) — first completed run ever | MONGODB_TEST_URI |
| CRUD integration (buses/routes/schedules/notifications/alerts/users) | 30 passed | MONGODB_TEST_URI |
| PostgreSQL schema (local Postgres) | 3 passed | PG_TEST_URL |
| PostgreSQL TLS (local TLS Postgres, generated private CA) | 6 passed, 1 optional skipped | PG_TLS_TEST_URL + CA |
| Legacy HTTP suite | 53/53 | dev server |
| Production hardening | 4/4 | none |

**Full suite: `npx vitest run --no-file-parallelism` → 170 passed, 5 skipped (175 total).** The 5 skipped are
`ci-guard`'s "is X configured" meta-tests (gated on `CI_REQUIRE_INTEGRATION=1`, not relevant locally) plus one
optional wrong-DNS TLS test.

**FerretDB is not MongoDB.** It lacks TTL indexes, partial indexes and transactions; the GPS and model tests
were designed to avoid those features, so a real `mongod`/Atlas run remains the recommended final check before
production, but it is no longer a blocker on exercising or trusting the application code itself — the two real
bugs that were actually causing failures (see Cycle 7 above) are fixed and proven against a real MongoDB-wire
server over real PostgreSQL storage.

---

## Outstanding work (priority order, post–Cycle 7)

1. **NOT STARTED — highest priority**: Frontend integration — connect React app to `apps/api`
   - Auth: replace `AppContext` login with `apps/api` endpoints; access token in memory, refresh in HttpOnly cookie
   - Driver GPS: connect `src/services/locationService.ts` → `POST /api/v1/telemetry`
   - Student: dashboard, live map, notifications
   - Admin: bus/route/user/schedule management screens
2. **NOT STARTED**: Leaflet live map with real GPS data (Socket.IO subscription, freshness, stops polyline)
3. **NOT STARTED**: ETA calculation (haversine, clearly not road distance)
4. **NOT STARTED**: IndexedDB offline queue wired to the new `apps/api` telemetry endpoint
5. **NOT STARTED**: Playwright E2E tests
6. **IMPLEMENTED — NOT VERIFIED**: Run the GitHub Actions CI workflow itself (it has not executed on GitHub; the equivalent checks were run locally this cycle: lint, build, full test suite against FerretDB/PostgreSQL/TLS-PostgreSQL)
7. **IMPLEMENTED — NOT VERIFIED**: Verify against a true `mongod` or MongoDB Atlas (FerretDB sufficed to unblock and validate the application logic; a real MongoDB run is still worth doing before production, for the index/transaction features FerretDB doesn't support)
8. **NOT STARTED**: MongoDB Atlas connectivity (create cluster, whitelist IPs, test) — needs a user-supplied Atlas URI
9. **NOT STARTED**: Render + Vercel final deployment config
10. **BLOCKED**: Production Postgres inspection (user must run `scripts/inspect-postgres.ts` against the real production database and share sanitized output)

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

- Auth integration verified on FerretDB (real MongoDB wire protocol over real PostgreSQL storage) but not yet on a true `mongod`/Atlas instance
- Rate limiter is in-process only (multi-replica needs Redis)
- No email provider configured (tokens logged to stdout in dev)
- Frontend still uses legacy server (no Bearer token, no refresh cookies)
- `api/index.ts` (Vercel serverless entry) still exists; cannot host Socket.IO; to be removed
- Legacy GPS ingest (`server/routes/driver.ts`) has authorization gaps listed in `ARCHITECTURE.md` section 2

## Bugs fixed this cycle (Cycle 7) — see full narrative above

- `apps/api/src/http/app.ts`: the `/api/v1/auth/*` router's handlers were not wrapped in the async-error helper, so any thrown error (validation, 401/403/409) left the HTTP request hanging until client timeout instead of returning a response. Previously misdiagnosed as "FerretDB crashes under load."
- `apps/api/src/auth/passwords.ts`: the timing-safe login path's dummy password hash was an invalidly-encoded argon2 string; `argon2.verify()` throws rather than returning false on malformed input, so unknown-email logins threw a 500 instead of returning 401. Fixed with a defensive try/catch in `verifyPassword()` and a properly computed dummy hash (`getDummyHash()`).
- `apps/api/src/http/app.ts`: `GET /api/v1/buses/:id/live` and `POST /api/v1/telemetry` had redundant pre-validation (`idParam.parse()`, `requireRole('DRIVER')`) that pre-empted more specific, already-implemented domain-layer checks (`LiveService.authorize()`'s malformed-id-as-404 rule; `TelemetryIngestService.ingest()`'s `DRIVER_ROLE_REQUIRED` code). Removed the redundant checks.
- `apps/api/tests/auth.integration.test.ts`: the password-reset test asserted zero live refresh tokens *after* a post-reset login, which always issues a new one — the assertion could never pass. Reordered to check immediately after reset, before the new login.

## Commit commands for the next session

```bash
git checkout campusmove-mern-rebuild-d9c7ac4
git pull origin campusmove-mern-rebuild-d9c7ac4   # get latest after push
npm ci
npm run lint
npx tsc -p apps/api --noEmit
npm run build
# with real mongod:
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```
