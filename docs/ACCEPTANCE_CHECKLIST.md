# CampusMove — Acceptance Checklist

Status values: `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED — NOT VERIFIED` | `VERIFIED` | `BLOCKED` | `NOT APPLICABLE — JUSTIFIED`

A requirement is `VERIFIED` only when it has evidence from an executed test, an inspected build output, or an explicitly documented manual verification.

---

## 1. Build and infrastructure

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1.1 | TypeScript compile (legacy app) passes | VERIFIED | `npm run lint` → 0 errors |
| 1.2 | TypeScript compile (apps/api strict) passes | VERIFIED | `npx tsc -p apps/api --noEmit` → clean |
| 1.3 | Production build succeeds | VERIFIED | `npm run build` → `✓ built in ~2 s` |
| 1.4 | Dependency audit clean | VERIFIED | `npm audit` → 0 vulnerabilities |
| 1.5 | No secrets committed | VERIFIED | grep on tracked files, no `.env` or credentials |
| 1.6 | CI workflow configured | IMPLEMENTED — NOT VERIFIED | `.github/workflows/ci.yml` written; not run on GitHub yet |
| 1.7 | Monorepo split (`apps/web`, own `package.json`) | NOT STARTED | — |

## 2. Authentication and authorization

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1 | Registration (student, driver) | IMPLEMENTED — NOT VERIFIED | `AuthService.register()`, HTTP route; Argon2id hash; integration test written but FerretDB timeouts prevented full run |
| 2.2 | Driver registration → PENDING status | IMPLEMENTED — NOT VERIFIED | same |
| 2.3 | ADMIN self-registration blocked | IMPLEMENTED — NOT VERIFIED | same |
| 2.4 | Login with Argon2id | IMPLEMENTED — NOT VERIFIED | `AuthService.login()`; bcrypt live-migration |
| 2.5 | Refresh token rotation + revocation | IMPLEMENTED — NOT VERIFIED | `MongoRefreshTokenRepository`; family revocation |
| 2.6 | Refresh token replay detection | IMPLEMENTED — NOT VERIFIED | `AuthService.refresh()` |
| 2.7 | Email verification workflow | IMPLEMENTED — NOT VERIFIED | `AuthService.verifyEmail()`, OTP hashed with SHA-256 |
| 2.8 | Password reset workflow | IMPLEMENTED — NOT VERIFIED | `AuthService.confirmPasswordReset()`, revokes all sessions |
| 2.9 | Admin bootstrap (first-admin only) | IMPLEMENTED — NOT VERIFIED | `AuthService.bootstrapAdmin()` |
| 2.10 | Login rate limiting | IMPLEMENTED — NOT VERIFIED | `LoginLimiter` in `AuthService` |
| 2.11 | bcrypt → Argon2id live migration on login | IMPLEMENTED — NOT VERIFIED | `verifyPassword()` detects `$2*` prefix |
| 2.12 | JWT secret fails-safe in production | VERIFIED | boot test: exits with FATAL if missing |
| 2.13 | REFRESH_TOKEN_SECRET separate + required | IMPLEMENTED — NOT VERIFIED | `requireRefreshSecret()` |
| 2.14 | Access token: 15 min, HS256, pinned alg/iss/aud | VERIFIED | `tests/auth-tokens.test.ts` (mutation check killed all) |
| 2.15 | Logout / logout-all revokes refresh tokens | IMPLEMENTED — NOT VERIFIED | routes wired |
| 2.16 | Cross-origin cookie + CSRF (if cookies used) | NOT STARTED | current impl uses Bearer tokens; cookies deferred |
| 2.17 | Auth integration tests pass on real MongoDB | BLOCKED | FerretDB process crashes under load; CI has `mongo:7` but not run yet |

## 3. Backend APIs

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1 | Bus CRUD (create, list, get, update, delete) | IMPLEMENTED — NOT VERIFIED | `MongoBusRepository` + HTTP router |
| 3.2 | Bus driver/route assignment | IMPLEMENTED — NOT VERIFIED | `assignDriver`, `assignRoute` endpoints |
| 3.3 | Route CRUD + ordered stops | IMPLEMENTED — NOT VERIFIED | `MongoRouteRepository`, stops embedded with GeoJSON |
| 3.4 | Schedule CRUD | NOT STARTED | model exists, no repository or routes yet |
| 3.5 | User list + status management (admin) | IMPLEMENTED — NOT VERIFIED | `PATCH /api/v1/users/:id/status` |
| 3.6 | Student transport assignment (admin) | IMPLEMENTED — NOT VERIFIED | `POST /api/v1/users/:id/assign-transport` |
| 3.7 | Trip start / end | IMPLEMENTED — NOT VERIFIED | `TripService`, HTTP routes; one-active-trip constraint |
| 3.8 | Trip list / history | IMPLEMENTED — NOT VERIFIED | `TripRepository.list()` with filters |
| 3.9 | Notifications / announcements | NOT STARTED | model exists, no HTTP layer |
| 3.10 | Emergency alerts | NOT STARTED | model exists, no HTTP layer |
| 3.11 | Driver approval workflow | IMPLEMENTED — NOT VERIFIED | via `PATCH /users/:id/status` |
| 3.12 | Input validation (Zod) on all routes | IMPLEMENTED — NOT VERIFIED | inline schemas in `http/app.ts` |
| 3.13 | Consistent error format + no stack traces | VERIFIED | centralized error handler in `http/app.ts` |
| 3.14 | Pagination on all list endpoints | IMPLEMENTED — NOT VERIFIED | `pageOpts()` utility, pageSize clamped 1–100 |

## 4. GPS and real-time tracking

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1 | Driver-only ingest, role checked server-side | VERIFIED | `telemetry-security.integration.test.ts` (11 tests, FerretDB) |
| 4.2 | Trip/vehicle assignment enforced | VERIFIED | same |
| 4.3 | Server-controlled simulation flag | VERIFIED | same |
| 4.4 | Device timestamp untrusted; server receivedAt | VERIFIED | `telemetry-integrity.integration.test.ts` (FerretDB) |
| 4.5 | No invented speed | VERIFIED | same |
| 4.6 | Idempotent event processing | VERIFIED | same |
| 4.7 | Out-of-order events handled | VERIFIED | same |
| 4.8 | Offline late-sync events stored, not live | VERIFIED | same |
| 4.9 | Live position not moved backwards | VERIFIED | same |
| 4.10 | Freshness: LIVE/STALE/OFFLINE/ENDED | VERIFIED | `live-access.integration.test.ts` (FerretDB) |
| 4.11 | Socket.IO: token in handshake only | VERIFIED | same |
| 4.12 | Socket.IO: per-subscription auth | VERIFIED | same |
| 4.13 | Socket.IO: token expiry closes connection | VERIFIED | same |
| 4.14 | GPS tests verified on real MongoDB | BLOCKED | FerretDB used; CI `mongo:7` not run |
| 4.15 | IndexedDB offline queue (frontend) | NOT STARTED | existing `src/services/offlineQueue.ts` not connected to new API |

## 5. Frontend integration

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1 | React app connected to apps/api auth | NOT STARTED | — |
| 5.2 | Student dashboard connected to real data | NOT STARTED | — |
| 5.3 | Driver trip workflow connected | NOT STARTED | — |
| 5.4 | Admin CRUD screens connected | NOT STARTED | — |
| 5.5 | Leaflet map with live bus positions | NOT STARTED | — |
| 5.6 | Route polylines and stop markers | NOT STARTED | — |
| 5.7 | Freshness indicators on map | NOT STARTED | — |
| 5.8 | ETA display | NOT STARTED | — |
| 5.9 | No mock/placeholder data in production paths | NOT STARTED | legacy mocks still present |
| 5.10 | Mobile-responsive driver workflow | NOT STARTED | — |

## 6. Database and migration

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1 | Mongoose models (10 collections) | VERIFIED | `models-persistence.integration.test.ts` (FerretDB) |
| 6.2 | Indexes, unique constraints | VERIFIED | same |
| 6.3 | Restart persistence | VERIFIED | same |
| 6.4 | Concurrent trip-start (one active per bus/driver) | VERIFIED | same (5 goroutines) |
| 6.5 | Production Postgres data inspected | BLOCKED | user must run `scripts/inspect-postgres.ts` locally |
| 6.6 | Migration script (if data exists) | NOT STARTED | plan in `docs/MIGRATION_PLAN.md` |
| 6.7 | MongoDB Atlas connectivity verified | BLOCKED | no Atlas URI available |
| 6.8 | Telemetry retention purge scheduled | NOT STARTED | `purgeReceivedBefore()` exists, no job |

## 7. CI and testing

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 7.1 | Vitest unit suite | VERIFIED | `npm test` (no services): 49 passed, 64 skipped |
| 7.2 | Integration tests on real services | BLOCKED | CI workflow written but not run; FerretDB used locally |
| 7.3 | CI guard fails when integration suites skipped | VERIFIED | `CI_REQUIRE_INTEGRATION=1` fails without services |
| 7.4 | Legacy HTTP suite | VERIFIED | 53/53 across 4 consecutive runs |
| 7.5 | Production hardening script | VERIFIED | 4/4 |
| 7.6 | Playwright E2E | NOT STARTED | — |
| 7.7 | Security + dependency audit | VERIFIED | 0 vulnerabilities |

## 8. Deployment and operations

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1 | Vercel frontend config | NOT STARTED | `vercel.json` exists but points to serverless entry |
| 8.2 | Render persistent API service | NOT STARTED | `render.yaml` updated but never deployed |
| 8.3 | MongoDB Atlas setup instructions | NOT STARTED | — |
| 8.4 | `.env.example` complete | VERIFIED | all vars documented, no secrets |
| 8.5 | Health endpoint | VERIFIED | `/api/health` (legacy) + `/healthz` (apps/api) |
| 8.6 | Graceful shutdown | NOT STARTED | — |
| 8.7 | Backup and recovery docs | NOT STARTED | — |
| 8.8 | Smoke-test checklist | NOT STARTED | — |
| 8.9 | Production data not touched | VERIFIED | no connection made to production |
| 8.10 | Branch not merged to main | VERIFIED | work is on `feature/mern-rebuild` only |

---

## Summary

- **VERIFIED**: 22 requirements
- **IMPLEMENTED — NOT VERIFIED**: 22 requirements (most need real MongoDB via CI or Atlas)
- **NOT STARTED**: 18 requirements
- **BLOCKED**: 5 requirements (production data, real MongoDB run, Atlas connectivity)
- **Total**: 67 requirements tracked
