# CampusMove Implementation Status

Last updated: 2026-10-19
Branch: `feature/frontend-v1-integration` (2 commits ahead of main)

## Status key
- `VERIFIED` — code + test evidence
- `IMPLEMENTED — NOT VERIFIED` — code exists, no live MongoDB test
- `IN PROGRESS` — partially built this session
- `NOT STARTED`
- `BLOCKED` — depends on external resource
- `NOT APPLICABLE — JUSTIFIED`

---

## Backend (apps/api — MongoDB/Argon2id)

| Requirement | Status | Notes |
|-------------|--------|-------|
| MongoDB connection + graceful shutdown | IMPLEMENTED — NOT VERIFIED | server.ts wired |
| Campus model + bootstrap endpoint | IMPLEMENTED — NOT VERIFIED | GET/POST /api/v1/campuses |
| User registration (Argon2id) | IMPLEMENTED — NOT VERIFIED | auth/service.ts |
| Login + access token (15 min) | IMPLEMENTED — NOT VERIFIED | |
| Refresh token rotation | IMPLEMENTED — NOT VERIFIED | |
| Refresh token replay detection | IMPLEMENTED — NOT VERIFIED | |
| Email OTP verification | IMPLEMENTED — NOT VERIFIED | ConsoleEmailSender default |
| Password reset via OTP | IMPLEMENTED — NOT VERIFIED | |
| Auth rate limiting | IMPLEMENTED — NOT VERIFIED | |
| RBAC (STUDENT/DRIVER/ADMIN) | IMPLEMENTED — NOT VERIFIED | |
| Tenant isolation by campusId | IMPLEMENTED — NOT VERIFIED | |
| Bus CRUD | IMPLEMENTED — NOT VERIFIED | |
| Bus driver/route assignment | IMPLEMENTED — NOT VERIFIED | |
| Route + ordered stops CRUD | IMPLEMENTED — NOT VERIFIED | |
| Trip start/end (one-active-trip guard) | IMPLEMENTED — NOT VERIFIED | |
| GPS telemetry ingestion (validation, dedup, server timestamp) | IMPLEMENTED — NOT VERIFIED | |
| Socket.IO authenticated subscriptions | IMPLEMENTED — NOT VERIFIED | |
| Live vehicle position store | IMPLEMENTED — NOT VERIFIED | |
| Historical telemetry store | IMPLEMENTED — NOT VERIFIED | |
| Schedules CRUD | IMPLEMENTED — NOT VERIFIED | |
| Notifications CRUD + broadcast | IMPLEMENTED — NOT VERIFIED | |
| Emergency alerts (raise/ack/resolve) | IMPLEMENTED — NOT VERIFIED | |
| User status management (admin) | IMPLEMENTED — NOT VERIFIED | |
| GET /api/v1/users/me | IMPLEMENTED — NOT VERIFIED | Fixed routing order this session |
| MongoDB indexes | IMPLEMENTED — NOT VERIFIED | ensureIndexes() called at startup |
| Zod input validation throughout | IMPLEMENTED — NOT VERIFIED | |
| Admin bootstrap (first-admin flow) | NOT STARTED | Documented: manual Atlas edit |
| Refresh token returned in body | BLOCKED | Need to verify auth/service.ts refresh() return shape |
| Auth integration tests on real MongoDB | BLOCKED | Needs MONGODB_URI |
| Email delivery (SMTP) | BLOCKED | Needs SMTP credentials |

## Frontend

| Requirement | Status | Notes |
|-------------|--------|-------|
| v1 API client (in-memory token, silent refresh) | VERIFIED | lint + build |
| Campus selector on login | IMPLEMENTED — NOT VERIFIED | fetches /api/v1/campuses |
| Login via v1 (VITE_USE_V1_API=true) | IMPLEMENTED — NOT VERIFIED | |
| Register via v1 | IMPLEMENTED — NOT VERIFIED | |
| Logout (v1 token clear + socket disconnect) | IMPLEMENTED — NOT VERIFIED | |
| Session restore on reload | IMPLEMENTED — NOT VERIFIED | clears on reload (no HttpOnly cookie yet) |
| AppContext loads buses/routes/notifications/alerts from v1 | IMPLEMENTED — NOT VERIFIED | |
| Bus list (student/admin) | IMPLEMENTED — NOT VERIFIED | |
| Route list (student/admin) | IMPLEMENTED — NOT VERIFIED | |
| Live map (StudentLiveBuses) with socketV1 | IMPLEMENTED — NOT VERIFIED | haversine ETA included |
| socketV1 auto-resubscribe on reconnect | IMPLEMENTED — NOT VERIFIED | |
| Driver trip start/end via v1 | IMPLEMENTED — NOT VERIFIED | |
| GPS send via v1 telemetry endpoint | IMPLEMENTED — NOT VERIFIED | |
| Offline queue batch sync via v1 | IMPLEMENTED — NOT VERIFIED | |
| IndexedDB offline queue | VERIFIED (legacy) | unchanged |
| AdminBuses: create/update/delete via v1 | IMPLEMENTED — NOT VERIFIED | |
| AdminRoutes: create via v1 | IMPLEMENTED — NOT VERIFIED | |
| AdminAlerts: broadcast/acknowledge/resolve via v1 | IMPLEMENTED — NOT VERIFIED | |
| AdminDirectory: user status/assignment via v1 | NOT STARTED | page has no backend calls yet |
| AdminSchedules: full CRUD via v1 | NOT STARTED | |
| AdminAnalytics: real data from v1 | NOT STARTED | |
| Student schedule view | NOT STARTED | |
| Responsive mobile/desktop | VERIFIED (legacy) | unchanged |
| Code splitting (661KB → 240KB) | VERIFIED | build output |

## Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| render.yaml for apps/api | IMPLEMENTED — NOT VERIFIED | |
| vercel.json updated (removed legacy proxy, added v1 env) | IMPLEMENTED — NOT VERIFIED | |
| .env.example complete | VERIFIED | |
| docs/DEPLOYMENT.md | IMPLEMENTED — NOT VERIFIED | step-by-step guide |
| GitHub Actions CI | IMPLEMENTED — NOT VERIFIED | .github/workflows/ from earlier cycles |
| Production MongoDB connectivity | BLOCKED | needs Atlas URI + Render deploy |
| Playwright E2E | NOT STARTED | |
| Smoke tests post-deploy | NOT STARTED | |

## Data migration (PostgreSQL → MongoDB)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Inspect production Postgres data | BLOCKED | user to run locally |
| Migration script | NOT STARTED | depends on inspection result |
| Staging migration test | NOT STARTED | |
| Production cutover | NOT STARTED | requires explicit authorization |

---

## Next concrete tasks (priority order)

1. `git push origin feature/frontend-v1-integration` — push branch
2. Create MongoDB Atlas cluster, set `MONGODB_URI`
3. `npm run api:dev` locally, run bootstrap curl, verify login works
4. Fix refresh endpoint — verify `auth/service.ts refresh()` returns new `refreshToken` in body
5. Run auth integration tests against real Atlas: `MONGODB_URI=... npx vitest run apps/api/tests/auth.integration.test.ts`
6. Wire AdminDirectory to `adminV1.users.*`
7. Wire AdminSchedules to `schedulesV1.*`
8. Deploy to Render + Vercel, run smoke tests
9. Playwright E2E for the end-to-end GPS scenario
