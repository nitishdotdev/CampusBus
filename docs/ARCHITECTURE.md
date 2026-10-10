# Architecture

Status key: **Implemented** (verified in code), **Proposed** (not built).

## 1. Current system (Implemented, verified 2026-10-10)
- Single npm package. `server.ts` runs Express and Socket.IO on one process; in development it mounts Vite as middleware, in production it serves `dist/`.
- Frontend: React 19, TypeScript, Vite 8, Tailwind 4, React Router 7, Leaflet, Socket.IO client, global state in `src/store/AppContext.tsx`. No TanStack Query.
- Backend: Express 4 routes in `server/routes/*` (auth, colleges, buses, routes, trips, driver, notifications, alerts, analytics, schedules, complaints).
- Persistence: `server/db/index.ts` (~1,900 lines) with two modes: PostgreSQL via `pg`, or a JSON file in `.data/` (development only; production refuses to start without `DATABASE_URL`).
- Auth: JWT (HS256, 7 days) in a Bearer header, token kept in `localStorage`, bcryptjs hashes.
- Tenancy: every record carries `college_id`; routes filter by `req.user.collegeId`; sockets join `college:<id>` rooms.
- Offline GPS: IndexedDB queue in `src/services/offlineQueue.ts`.
- Deploy files: `render.yaml` (web service plus Render Postgres), `vercel.json` plus `api/index.ts` (serverless entry, cannot host Socket.IO).

## 2. Known gaps in the current GPS path (Implemented behavior, verified in `server/routes/driver.ts`)
- `POST /api/driver/location` checks that the bus is in the caller's college, not that the caller is the assigned driver or has an active trip; `ADMIN` may also post.
- `trip_id` falls back to `'no_trip'`; client `timestamp` and `id` are trusted without bounds.
- Missing speed is replaced with a constant 22 km/h before ETA calculation.
- `isSimulated` is accepted from the client in any environment.
- Out-of-order points still overwrite the bus's live position; there is no staleness cut-off on write.
- The room is `college:<id>`; there is no per-route or per-student subscription check.
These are Stage 4 work items and are covered by planned tests (see `IMPLEMENTATION_STATUS.md`).

## 3. Target system (Proposed)
```
apps/web  (React + Vite + TS + Tailwind + TanStack Query + Leaflet)  --> Vercel
apps/api  (Express + TS + Mongoose + Socket.IO + Zod)                --> Render (persistent Node service)
MongoDB Atlas                                                         --> primary database
```
- Persistent Node service for REST and Socket.IO; Vercel serves only static assets and rewrites SPA routes. The serverless `api/index.ts` is removed once the Render service is the API.
- Auth: short-lived access token plus rotating refresh token in an `HttpOnly; Secure; SameSite=None` cookie (cross-site Vercel to Render), CSRF token on refresh/logout, Argon2id hashing, email verification and reset.
- Telemetry: driver device, Geolocation API, Zod validation, authenticated ingest, `Telemetry` insert (idempotent on `eventId`), conditional update of `VehicleLocation` only when the event is newer than the stored one, then Socket.IO emit to `route:<id>` rooms the client is authorised for.
- Live vs history are separate collections: `vehicleLocations` (one doc per bus) and `telemetry` (append-only, TTL index).

## 4. Migration strategy (Proposed, incremental)
Each step ends with lint, build, `npm test` and `npm run test:verify` green before the next starts.
1. Done: baseline fixes, security fixes, Vitest, CI.
2. Introduce a repository interface over the current `db` object and move routes to it, with no behavior change.
3. Add Mongoose models and a Mongo repository implementation behind the same interface; run the integration suite against both a disposable MongoDB and the current store.
4. Replace auth (Argon2id, refresh tokens, verification, reset).
5. Rebuild the GPS ingest and Socket.IO authorization with the gaps in section 2 closed.
6. Extract `apps/api` and `apps/web` (workspace move only, no logic changes).
7. Playwright journeys, then deployment configs.

### Compatibility risks
- Tokens in `localStorage` to cookies changes the frontend `apiClient` and the socket handshake.
- Cross-site cookies need HTTPS on both origins; must be tested in real browsers.
- `client ids` generated on the device (`loc_...`) vs server ObjectIds: keep client-supplied `eventId` as a separate idempotency key.
- Vite 8 and TypeScript 7 are very new; pin versions in the lockfile and keep CI as the guard.
- `render.yaml` provisions Postgres; it must be changed only when migration is authorised.
