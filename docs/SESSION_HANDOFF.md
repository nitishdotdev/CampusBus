# Session Handoff

**Branch:** `campusmove-mern-rebuild-d9c7ac4`
**Last commit:** see `git log --oneline | head -3`
**Status doc:** `docs/IMPLEMENTATION_STATUS.md`
**Checklist:** `docs/ACCEPTANCE_CHECKLIST.md`
**Continuation prompt:** `docs/CONTINUATION_PROMPT.md`

---

## Exact stopping point (Cycle 7)

The backend (`apps/api`) is now functionally complete for auth, buses, routes, schedules, notifications,
alerts, trips, users, GPS telemetry, and live tracking — and, as of this cycle, **actually verified end-to-end**
against real services, not just written. The "auth tests crash FerretDB under load" blocker from Cycles 5–6 was
misdiagnosed: the real cause was two application bugs (an unwrapped async Express route that let errors hang
requests forever, and an invalidly-encoded timing-safe dummy password hash that made `argon2.verify()` throw).
Both are fixed; see `docs/IMPLEMENTATION_STATUS.md` Cycle 7 section for the full narrative. The auth integration
suite now passes 29/29 in ~2 seconds, and the full suite (auth + CRUD + GPS + models + legacy + TLS) passes
170/175 (5 skipped are meta-tests / one optional case), run against FerretDB (MongoDB wire protocol) over real
PostgreSQL storage and a TLS-enabled PostgreSQL with a generated private CA.

**What is NOT done, and is now the largest remaining gap: nothing in `src/` (the React frontend) talks to
`apps/api` yet.** The frontend still runs entirely against the legacy PostgreSQL/file-backed `server.ts`. All
of `apps/api`'s routes, auth flow, and real-time gateway are built and tested but currently unreachable from
the actual product.

**The next session must start with: confirm this cycle's fixes are still committed and pushed (see "Commit
commands" below) → begin frontend integration, starting with auth (item 1 under "Highest-priority next
tasks").**

---

## What to run first

```bash
git checkout campusmove-mern-rebuild-d9c7ac4
npm ci
npm run lint            # must be 0 errors
npx tsc -p apps/api --noEmit   # must be clean
npm run build           # must succeed
```

### With MongoDB-wire-compatible service available (FerretDB over real PostgreSQL works; real `mongod`/Atlas also fine, never production)
```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 \
PG_TEST_URL=postgres://postgres:<pw>@127.0.0.1:5432/<disposable db> \
PG_TLS_TEST_URL=postgres://postgres:<pw>@localhost:5432/postgres \
PG_TLS_TEST_CA_FILE=/path/to/ca.crt \
npx vitest run --no-file-parallelism
```
Expected (Cycle 7 baseline): 170 passed, 5 skipped (175 total). Auth integration alone: 29/29. Omit
`PG_TLS_TEST_URL`/`PG_TLS_TEST_CA_FILE` to skip the TLS suite if no TLS-enabled Postgres is available — see
`tests/pg-tls.integration.test.ts`'s header comment for how to stand one up (openssl-generated private CA,
`ssl=on` in `postgresql.conf`). `--no-file-parallelism` is recommended for FerretDB: it's a single-process
server and many parallel Mongoose connections opening at once can be slow to establish, independent of the
real bugs this cycle fixed.

### Legacy suite
```bash
rm -rf .data
NODE_ENV=development PORT=3000 npx tsx server.ts &
sleep 12
npm run test:verify     # must be 53/53
kill %1
```

---

## What has been built (verified or implemented)

### Verified (test evidence, Cycle 7 — all re-run this cycle)
- JWT secret enforcement: production exits without `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`
- PostgreSQL TLS: URL parameters cannot override strict verification; `buildPgConnection` in `server/db/tls.ts`; now also verified against a real TLS-enabled PostgreSQL server with a generated private CA (6/7, 1 optional)
- CORS: strict allowlist in `server/config/cors.ts`, tested with mutation check
- GPS ingestion authorization (11 tests): role, trip ownership, vehicle assignment, cross-campus blocking, simulation flag
- GPS data integrity (FerretDB): timestamps, idempotency, ordering, speed source, offline sync, rate limit
- Live snapshot access control + freshness: REST and Socket.IO tests
- Mongoose models: constraints, pagination, one-active-trip, restart persistence
- **Auth integration (29/29) — newly verified this cycle**: register, login, refresh rotation + reuse detection, logout/logout-all, email OTP verification, password reset, admin bootstrap, bcrypt→Argon2id live migration, rate limiter wiring
- **CRUD integration (30/30) — newly verified this cycle**: buses, routes, schedules, notifications, emergency alerts, user management, all role-authorized server-side
- Legacy HTTP suite: 53/53 on real dev server
- Production hardening: 4/4
- 0 npm audit vulnerabilities

### Implemented, not yet verified on true `mongod`/Atlas (verified on FerretDB instead — see Known limitations)
- `AuthService` (`apps/api/src/auth/service.ts`): register, login, refresh rotation, logout, email verification, password reset, admin bootstrap, bcrypt → Argon2id live migration
- `AuthConfig` and `LoginLimiter`
- `MongoRefreshTokenRepository`, `MongoEmailTokenRepository`
- `MongoUserRepository` (extended: findByEmail, create, updateStatus, verifyEmail, updatePassword, list, assignTransport)
- `MongoBusRepository`, `MongoRouteRepository`, `MongoTripRepository`, `MongoScheduleRepository`, `MongoNotificationRepository`, `MongoEmergencyAlertRepository` (full CRUD + assignments)
- HTTP app: auth, buses, routes, schedules, notifications, alerts, users, trips, telemetry — all routes
- `ConsoleEmailSender` stub (logs tokens; replace with real provider for production)

### Not started
- Frontend integration with `apps/api` — **the current top priority; nothing else is blocking it**
- Leaflet map (live tracking, freshness, stops, ETA)
- IndexedDB offline queue connected to new API
- Playwright E2E tests
- MongoDB Atlas connection verification
- Production Postgres data inspection (`scripts/inspect-postgres.ts` not yet run by user)
- Render / Vercel deployment smoke test
- GitHub Actions CI run (workflow file exists, has not executed on GitHub)

---

## Key file locations

| Purpose | Path |
|---|---|
| Auth service | `apps/api/src/auth/service.ts` |
| Password hashing | `apps/api/src/auth/passwords.ts` |
| Access + refresh tokens | `apps/api/src/auth/tokens.ts` |
| HTTP app factory | `apps/api/src/http/app.ts` |
| Mongoose models | `apps/api/src/infra/mongo/models/` |
| Repositories | `apps/api/src/infra/mongo/repositories/index.ts` |
| Compose (wiring) | `apps/api/src/compose.ts` |
| Gateway (Socket.IO) | `apps/api/src/realtime/gateway.ts` |
| Test harness | `apps/api/tests/harness.ts` |
| Auth tests | `apps/api/tests/auth.integration.test.ts` |
| Domain types + ports | `apps/api/src/domain/types.ts` |
| GPS ingest service | `apps/api/src/domain/telemetry/ingest.ts` |
| Freshness logic | `apps/api/src/domain/telemetry/freshness.ts` |
| TLS config | `server/db/tls.ts` |
| CORS config | `server/config/cors.ts` |
| Legacy server | `server.ts` |

---

## Highest-priority next tasks (ordered, post–Cycle 7)

1. **Frontend auth integration**: replace `AppContext` login with `apps/api` endpoints; store access token in memory, refresh token in HttpOnly cookie (needs Express `cookie-parser` + CSRF token). This unblocks everything below.
2. **Student dashboard**: wire to real buses/routes/trips via `apps/api`
3. **Driver GPS workflow**: connect existing `src/services/locationService.ts` to `POST /api/v1/telemetry`; connect IndexedDB queue
4. **Admin CRUD screens**: buses, routes, stops, schedules, notifications, alerts, driver approval, student assignment — all connected to `apps/api` (every backend endpoint these screens need already exists and is tested)
5. **Leaflet map**: live positions via Socket.IO subscription to `apps/api`; freshness indicator; stops polyline
6. **ETA**: haversine distance + speed; clearly labelled as approximate (not road distance)
7. **Playwright E2E**: full admin → driver → student journey, now that there's a frontend to exercise
8. **GitHub Actions CI**: push and confirm the `.github/workflows/ci.yml` run actually passes on GitHub (equivalent checks already pass locally — see "What to run first")
9. **MongoDB Atlas / true `mongod`**: create a cluster or spin up real `mongod`, set `MONGODB_URI`/`MONGODB_TEST_URI`, run the full test suite against it instead of FerretDB, for the TTL-index/transaction features FerretDB doesn't support
10. **Render deploy**: update `render.yaml` to use `apps/api`; smoke test connectivity
11. **Vercel deploy**: update `vercel.json`; remove serverless entry; configure SPA routing

---

## Configuration required from the user before production

| Item | Where | Notes |
|---|---|---|
| `MONGODB_URI` | Render env + `.env` | MongoDB Atlas connection string |
| `ACCESS_TOKEN_SECRET` | Render env | ≥ 32 chars, random |
| `REFRESH_TOKEN_SECRET` | Render env | ≥ 32 chars, different from access |
| `CORS_ORIGIN` | Render env | Vercel frontend URL (https) |
| `DATABASE_SSL_MODE` | Render env | `encrypt-private` for internal URL, `verify` for external |
| Email provider | Render env | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` (or SendGrid/Resend API key) |
| MongoDB Atlas network access | Atlas dashboard | Allow Render's outbound IPs |
| `SIMULATION_MODE` | leave unset | Defaults to `off`; never `on` in production |

---

## Known limitations

- FerretDB (used in sandbox, and in CI) does not support TTL indexes, partial indexes or transactions. All GPS/model tests were designed around that, and this cycle confirmed the *application logic* is correct against a real MongoDB-wire server over real PostgreSQL storage — but the features FerretDB can't do still need a true `mongod`/Atlas pass before production. Telemetry retention uses a manual `purgeReceivedBefore()` call rather than a TTL index; a cron job or Render scheduled job is needed.
- The rate limiter in `AuthService` (`LoginLimiter`) and in `TelemetryIngestService` (`EventRateLimiter`) are in-process only. Multiple API replicas need Redis or similar.
- No email provider is configured. `ConsoleEmailSender` logs tokens to stdout — acceptable for development, not for production.
- The frontend still uses the legacy PostgreSQL/file-backed server, not `apps/api`. No feature flag has been introduced yet.
- `render.yaml` still provisions a PostgreSQL database. It must be updated to remove Postgres once MongoDB is the primary database and production data has been migrated (or confirmed disposable).
