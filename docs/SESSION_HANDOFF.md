# Session Handoff

**Branch:** `feature/mern-rebuild`
**Last commit:** see `git log --oneline | head -3`
**Status doc:** `docs/IMPLEMENTATION_STATUS.md`
**Checklist:** `docs/ACCEPTANCE_CHECKLIST.md`
**Continuation prompt:** `docs/CONTINUATION_PROMPT.md`

---

## Exact stopping point

Authentication service (`apps/api/src/auth/service.ts`) is complete and type-clean. The auth integration test (`apps/api/tests/auth.integration.test.ts`) is written. It was not run to completion because FerretDB (the MongoDB-wire-compatible process used in the sandbox) crashes under the load of 5 Mongoose connection opens + Argon2id hashing in quick succession. The tests are consolidated into one harness and use reduced Argon2 cost in test mode; the issue may be resolved on a real `mongod` or in CI.

**The next session must start with: verify tests run → commit auth work → continue with frontend integration.**

---

## What to run first

```bash
git checkout feature/mern-rebuild
npm ci
npm run lint            # must be 0 errors
npx tsc -p apps/api --noEmit   # must be clean
npm run build           # must succeed
```

### With MongoDB available (real `mongod` or Atlas, never production)
```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```
Expected: auth integration tests pass (23 tests in auth.integration.test.ts), plus ~90 others.

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

### Verified (test evidence)
- JWT secret enforcement: production exits without `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`
- PostgreSQL TLS: URL parameters cannot override strict verification; `buildPgConnection` in `server/db/tls.ts`
- CORS: strict allowlist in `server/config/cors.ts`, tested with mutation check
- GPS ingestion authorization (11 tests): role, trip ownership, vehicle assignment, cross-campus blocking, simulation flag
- GPS data integrity (FerretDB): timestamps, idempotency, ordering, speed source, offline sync, rate limit
- Live snapshot access control + freshness: REST and Socket.IO tests
- Mongoose models: constraints, pagination, one-active-trip, restart persistence
- Legacy legacy HTTP suite: 53/53 on real dev server
- Production hardening: 4/4
- 0 npm audit vulnerabilities

### Implemented, not yet verified on real MongoDB
- `AuthService` (`apps/api/src/auth/service.ts`): register, login, refresh rotation, logout, email verification, password reset, admin bootstrap, bcrypt → Argon2id live migration
- `AuthConfig` and `LoginLimiter`
- `MongoRefreshTokenRepository`, `MongoEmailTokenRepository`
- `MongoUserRepository` (extended: findByEmail, create, updateStatus, verifyEmail, updatePassword, list, assignTransport)
- `MongoBusRepository`, `MongoRouteRepository`, `MongoTripRepository` (full CRUD + assignments)
- HTTP app: auth routes, buses, routes, users, trips (PATCH status, assign-transport)
- `ConsoleEmailSender` stub (logs tokens; replace with real provider for production)

### Not started
- Schedule CRUD repository and routes
- Notifications and emergency alert HTTP layer
- Frontend integration with `apps/api`
- Leaflet map (live tracking, freshness, stops, ETA)
- IndexedDB offline queue connected to new API
- Playwright E2E tests
- MongoDB Atlas connection verification
- Production Postgres data inspection (`scripts/inspect-postgres.ts` not yet run by user)
- Render / Vercel deployment smoke test

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

## Highest-priority next tasks (ordered)

1. **Verify auth tests pass** on a real `mongod` or in CI (`MONGODB_TEST_URI=<real mongod> npm test`)
2. **Schedule CRUD**: add `MongoScheduleRepository`, routes in `apps/api/src/http/app.ts`, integration tests
3. **Notifications + emergency alerts**: routes and repository; admin broadcast and driver emergency SOS
4. **Frontend auth integration**: replace `AppContext` login with `apps/api` endpoints; store access token in memory, refresh token in HttpOnly cookie (needs Express `cookie-parser` + CSRF token)
5. **Student dashboard**: wire to real buses/routes/trips via `apps/api`
6. **Driver GPS workflow**: connect existing `src/services/locationService.ts` to `POST /api/v1/telemetry`; connect IndexedDB queue
7. **Admin CRUD screens**: buses, routes, stops, driver approval, student assignment — all connected to `apps/api`
8. **Leaflet map**: live positions via Socket.IO subscription to `apps/api`; freshness indicator; stops polyline
9. **ETA**: haversine distance + speed; clearly labelled as approximate (not road distance)
10. **Playwright E2E**: full admin → driver → student journey
11. **MongoDB Atlas**: create cluster, set `MONGODB_URI` in env, run full test suite against it
12. **Render deploy**: update `render.yaml` to use `apps/api`; smoke test connectivity
13. **Vercel deploy**: update `vercel.json`; remove serverless entry; configure SPA routing

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

- FerretDB (used in sandbox) does not support TTL indexes. Telemetry retention uses a manual `purgeReceivedBefore()` call; a cron job or Render scheduled job is needed.
- The rate limiter in `AuthService` (`LoginLimiter`) and in `TelemetryIngestService` (`EventRateLimiter`) are in-process only. Multiple API replicas need Redis or similar.
- No email provider is configured. `ConsoleEmailSender` logs tokens to stdout — acceptable for development, not for production.
- The frontend still uses the legacy PostgreSQL/file-backed server, not `apps/api`. No feature flag has been introduced yet.
- `render.yaml` still provisions a PostgreSQL database. It must be updated to remove Postgres once MongoDB is the primary database and production data has been migrated (or confirmed disposable).
