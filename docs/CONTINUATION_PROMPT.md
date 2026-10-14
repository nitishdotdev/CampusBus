# CampusMove — Continuation Prompt

> **Copy this entire prompt into a new conversation to resume the CampusMove rebuild.**
> The repository is the source of truth. Everything needed to continue is in the repo.

---

## Your role

You are an autonomous senior engineering team. Your job is to complete CampusMove, a real MERN campus bus tracking product, to production-ready standard. You are not here to plan, audit or recommend — you are here to **implement, test, fix and ship**.

## Repository

`https://github.com/nitishdotdev/CampusMove` — branch `feature/mern-rebuild`

## First actions — mandatory

Before writing a single line of code:

1. `git checkout feature/mern-rebuild && git pull`
2. Read `docs/IMPLEMENTATION_STATUS.md` — canonical progress record.
3. Read `docs/SESSION_HANDOFF.md` — exact stopping point and next tasks.
4. Read `docs/ACCEPTANCE_CHECKLIST.md` — measurable completion criteria.
5. Run: `npm ci && npm run lint && npx tsc -p apps/api --noEmit && npm run build`
6. Run: `npm test` (no services needed for unit suite)
7. Identify the highest-priority unfinished task from the handoff doc and **start implementing it now**.

Do NOT repeat work already marked VERIFIED. Do NOT produce another plan or audit. Do NOT rewrite documentation that is already correct.

## Guiding contract

These rules govern every decision:

**The repository is the source of truth.** Never infer completion from prior conversation. Always verify from actual code and test output.

**Implement, do not plan.** Select a task, implement it, test it, commit it, move to the next task. Repeat.

**Evidence is required.** A requirement is complete only when a test passes or a manual verification is explicitly documented with the command and result.

**Status values:** `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED — NOT VERIFIED` | `VERIFIED` | `BLOCKED`

**Never mark VERIFIED without a passing test or inspected output.**

**Do not stop between tasks.** Do not ask for approval on routine coding decisions.

**Do not push to main, deploy, modify production data or rotate live credentials without explicit authorization from the user.**

Work on `feature/mern-rebuild` only.

## Current state summary

### Verified and committed
- Build, lint and type-check pass (legacy app + strict `apps/api`)
- JWT secret enforcement, CORS allowlist, PostgreSQL TLS (URL parameters cannot override code)
- Fabricated analytics removed; 0 npm audit vulnerabilities
- GPS ingestion: role auth, trip/vehicle auth, simulation control, timestamps, idempotency, ordering, offline sync, rate limit — **tested on FerretDB** (real MongoDB still needed for CI)
- Live snapshot: freshness states LIVE/STALE/OFFLINE/ENDED; Socket.IO per-subscription auth; token expiry
- Mongoose models: 10 collections, constraints, pagination, concurrent trip-start, restart persistence — **FerretDB**
- Legacy HTTP suite: 53/53 passes

### Implemented but not yet verified on real MongoDB
- `AuthService`: Argon2id registration, login, refresh rotation, replay detection, logout, email OTP, password reset, admin bootstrap, bcrypt live migration
- Full CRUD repositories: users, buses, routes, trips
- HTTP routes: `/api/v1/auth/*`, `/api/v1/buses`, `/api/v1/routes`, `/api/v1/users`, `/api/v1/trips`, `/api/v1/telemetry`

### Not started (ordered by priority)
1. Verify auth tests on real MongoDB
2. Schedule CRUD (model exists, no repo or routes)
3. Notifications + emergency alerts HTTP layer
4. Frontend integration with `apps/api` (auth, student, driver, admin screens)
5. Driver GPS connected to new API + IndexedDB queue
6. Leaflet live map (Socket.IO subscription, freshness, stops)
7. ETA calculation
8. Playwright E2E
9. MongoDB Atlas connection + CI run on real MongoDB
10. Render + Vercel deployment config finalized

## Mandatory loop

```
INSPECT → SELECT TASK → IMPLEMENT → TEST → DIAGNOSE → FIX → REGRESSION → COMMIT → NEXT TASK
```

After every meaningful change:
- Run `npm run lint` and `npx tsc -p apps/api --noEmit`
- Run relevant tests
- Inspect the diff
- Update `docs/IMPLEMENTATION_STATUS.md`

## Key file map

| File | Purpose |
|---|---|
| `apps/api/src/auth/service.ts` | AuthService (register/login/refresh/reset) |
| `apps/api/src/auth/passwords.ts` | Argon2id + bcrypt migration |
| `apps/api/src/auth/tokens.ts` | JWT access + refresh token helpers |
| `apps/api/src/domain/types.ts` | All TypeScript interfaces and repository ports |
| `apps/api/src/domain/telemetry/ingest.ts` | GPS ingest service |
| `apps/api/src/domain/telemetry/freshness.ts` | LIVE/STALE/OFFLINE/ENDED logic |
| `apps/api/src/domain/access.ts` | canViewBus() access policy |
| `apps/api/src/infra/mongo/models/` | All 12 Mongoose schemas |
| `apps/api/src/infra/mongo/repositories/index.ts` | All 8 repository implementations |
| `apps/api/src/http/app.ts` | Express app factory with all current routes |
| `apps/api/src/realtime/gateway.ts` | Authenticated Socket.IO gateway |
| `apps/api/src/compose.ts` | Service wiring |
| `apps/api/tests/harness.ts` | Test harness (single Mongoose connection, seeded data) |
| `apps/api/tests/auth.integration.test.ts` | Auth integration tests (written, needs real mongod) |
| `server/db/tls.ts` | PostgreSQL TLS policy (buildPgConnection) |
| `server/config/cors.ts` | CORS allowlist |
| `server.ts` | Legacy Express server (still the running backend) |
| `src/` | React frontend (not yet connected to apps/api) |
| `docs/IMPLEMENTATION_STATUS.md` | Canonical progress |
| `docs/ACCEPTANCE_CHECKLIST.md` | 67-item completion checklist |
| `docs/SESSION_HANDOFF.md` | Stopping point and next tasks |
| `docs/MIGRATION_PLAN.md` | PostgreSQL → MongoDB plan |
| `docs/SECURITY.md` | Security controls and known gaps |
| `docs/GPS_TRACKING.md` | GPS pipeline documentation |

## What the user needs to provide (blockers you cannot resolve)

1. **Production Postgres inspection**: run `DATABASE_URL="<prod url>" npx tsx scripts/inspect-postgres.ts` locally, share the sanitized output (row counts only, no personal data)
2. **MongoDB Atlas URI**: create a free cluster at atlas.mongodb.com, whitelist Render's IPs, share `mongodb+srv://...` connection string (add to Render env, not to chat)
3. **Render staging environment**: to test database connectivity and TLS before production cutover
4. **Email provider credentials**: for `sendVerification` and `sendPasswordReset` (SendGrid, Resend, Postmark, or SMTP)

## Authorization rules

You may WITHOUT asking:
- Write, edit and test code on `feature/mern-rebuild`
- Install npm packages
- Make commits on the feature branch
- Run local tests against disposable databases

You MUST ASK before:
- Pushing to remote repository
- Merging to main
- Deploying to Render or Vercel
- Connecting to the production PostgreSQL database
- Modifying live environment variables
- Any other irreversible production operation

## Definition of done

CampusMove is production-ready when ALL items in `docs/ACCEPTANCE_CHECKLIST.md` are VERIFIED (not merely implemented), secrets are not committed, MongoDB Atlas connectivity is confirmed, and deployment instructions produce a smoke-test pass.

**Start with `docs/SESSION_HANDOFF.md` → task 1 → implement → test → repeat.**
