# Session Handoff — CampusMove

## Branch state

Working branch: `feature/frontend-v1-integration`
Created from: `main` (which contains all Cycle 1–6 work from `campusmove-mern-rebuild-d9c7ac4`)
Last commit: `131330f` — "feat: v1 API integration"
Main is clean. This branch is NOT yet pushed — push with:
```
git push origin feature/frontend-v1-integration
```

## What was verified this session

- `npm run lint` → 0 TypeScript errors (frontend + apps/api)
- `npm run build` → success; app chunk 240 KB (down from 661 KB, code splitting applied)
- `npm run api:build` → success; dist/api.cjs 85 KB
- All prior tests from main still pass (no test infrastructure was changed)

## What was built this session (23 files, 1067 insertions)

### apps/api additions
- `apps/api/src/infra/mongo/models/campus.ts` — Campus Mongoose schema
- Campus wired into models/index.ts, domain/types.ts (CampusDTO, CampusRepository), repositories/index.ts (MongoCampusRepository)
- `apps/api/src/server.ts` — standalone entry point: loads env, connects MongoDB, wires compose.ts services, adds campus bootstrap routes, creates Socket.IO gateway via createGateway, graceful SIGTERM/SIGINT shutdown
- `apps/api/src/http/app.ts` — fixed GET /api/v1/users/me routing (moved before /:id to prevent Express shadowing)
- `package.json` — api:dev, api:build, api:start scripts

### Frontend v1 service layer (src/services/v1/)
- `client.ts` — Fetch wrapper: access token in memory, silent refresh on 401, deduplicated concurrent refresh via promise sharing
- `auth.ts` — loginV1, registerV1, logoutV1, getMeV1, listCampuses
- `buses.ts` — buses CRUD + assignDriver, assignRoute, livePosition
- `routes.ts` — routes CRUD
- `trips.ts` — start, end, list
- `telemetry.ts` — single GPS event + batch sync (for offline queue)
- `notifications.ts` — notifications, alerts, schedules full CRUD
- `admin.ts` — users list/status/assignTransport
- `socket.ts` — Socket.IO client: auth in handshake, subscribe/unsubscribe per busId, auto-resubscribe on reconnect

### Frontend integration
- `src/pages/auth/LoginPage.tsx` — campus selector dropdown from GET /api/v1/campuses; dual-mode: v1 or legacy via VITE_USE_V1_API flag
- `src/services/authService.ts` — added setV1Session() bridge: maps V1SessionUser → legacy User format so existing AppContext works without full rewrite
- `src/pages/driver/DriverDashboard.tsx` — handleStartTrip/handleEndTrip use tripsV1 when v1 enabled
- `src/services/locationService.ts` — GPS send + offline batch sync route through telemetryV1 when v1 enabled
- `src/store/AppContext.tsx` — v1Campuses state loaded from API; loadAllData fetches buses/routes/notifications/alerts from v1 endpoints; socketV1.connect() called on login; logout clears v1 tokens
- `vite.config.ts` — manualChunks code splitting (react, map, socket, lucide vendor chunks)
- `.env.example` — complete environment variable reference

## Architecture of v1 integration

The feature flag `VITE_USE_V1_API=true` in the frontend .env activates the v1 code paths.
When false (default), everything routes through the legacy server.ts/PostgreSQL backend — zero regression.

```
VITE_USE_V1_API=false  →  legacy  server.ts (PostgreSQL) on port 3000
VITE_USE_V1_API=true   →  new     apps/api/src/server.ts (MongoDB) on port 4000
```

After v1 login:
1. loginV1() → POST /api/v1/auth/login → { tokens, refreshToken, user }
2. Access token stored in memory (v1Token module), refresh token in memory
3. authService.setV1Session(user) bridges to legacy AppContext (stores 'v1' sentinel as token)
4. socketV1.connect() opens Socket.IO with Bearer token in handshake auth
5. AppContext.loadAllData() fetches from /api/v1/* endpoints and maps to legacy Bus/Route/etc types

## What is NOT yet done (priority order)

### P1 — Requires no external dependency
1. **Leaflet live map with v1 socket data** — StudentLiveBuses.tsx still reads from legacy realtimeService; needs to subscribe via socketV1.subscribeTobus() per loaded bus
2. **ETA calculation** — haversine from driver's current lat/lng to each upcoming stop; no ML needed, just straight-line math as first pass
3. **Admin pages connected to v1** — AdminBuses, AdminRoutes, AdminSchedules, AdminDirectory, AdminAlerts, AdminComplaints pages still call legacy adminService; need v1 wiring
4. **Driver assignment flow UI** — Admin must be able to see buses and assign drivers through the UI; backend endpoint exists (POST /api/v1/buses/:id/assign-driver)
5. **Session restore on page reload** — if VITE_USE_V1_API=true and the page reloads, the access token is lost (it's in memory); need getMeV1() flow on startup with stored refresh token OR fallback to re-login

### P2 — Needs MongoDB Atlas URI to verify
6. **Auth integration tests on real MongoDB** — BLOCKED until MONGODB_URI is provided; test harness is already written
7. **Campus bootstrap** — One-time: POST /api/v1/campuses with x-bootstrap-secret header to create the first campus record; required before any login works on v1
8. **Verify refresh token endpoint** — apps/api/src/auth/service.ts refresh() return shape needs to include new refreshToken in body (for non-cookie flow); not yet confirmed

### P3 — Deployment
9. **Render deployment config** — render.yaml or dashboard config for apps/api server (Node, port 4000, health check /healthz)
10. **Vercel config** — vercel.json with VITE_USE_V1_API=true, VITE_API_V1_URL pointing to Render URL
11. **Playwright E2E** — end-to-end scenario from section 12 of master prompt; still NOT STARTED
12. **MongoDB Atlas IP allowlist** — must allow Render's outbound IPs (or 0.0.0.0/0 for testing)

## How to start the next session

```bash
git checkout feature/frontend-v1-integration
npm ci
npm run lint     # must stay 0 errors
npm run build    # must succeed
```

Then resume at P1 item 1: wire socketV1 into StudentLiveBuses.tsx.

## Immediate bootstrap sequence (once Atlas URI is available)

```bash
# 1. Set env vars in .env
# 2. Start API server
npm run api:dev

# 3. Create the first campus (run once)
curl -X POST http://localhost:4000/api/v1/campuses \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: YOUR_BOOTSTRAP_SECRET" \
  -d '{"name":"Apex State University","shortCode":"ASU","city":"Los Angeles","lat":34.0537,"lng":-118.2570,"zoom":15,"timezone":"America/Los_Angeles"}'

# 4. Register the first admin (set VITE_USE_V1_API=true in .env first)
# Use the campusId from step 3 response
# NOTE: role ADMIN must be registered by setting status ACTIVE manually in MongoDB
# or by adding a bootstrap-admin endpoint (not yet built)

# 5. Start frontend
npm run dev
```
