# Database

## Current schema (Implemented: `server/db/schema.sql`, `005-add-schedules-complaints.sql`)
PostgreSQL tables: `colleges`, `users`, `routes`, `stops`, `buses`, `trips`, `locations`, `emergency_alerts`, `notifications`, `schedules`, `complaints`. All string primary keys (`VARCHAR(64)`), `college_id` on every table.

Notable constraints (verified):
- `users.email` UNIQUE (global, not per college); `role` CHECK in STUDENT/DRIVER/ADMIN.
- Partial unique indexes: one active trip per bus, one active trip per driver.
- Indexes on `college_id`, `stops.route_id`, `trips.bus_id/driver_id`, `locations.trip_id/recorded_at`.

Gaps: `locations` has no uniqueness on a client event id and no retention; the latest position lives on `buses` (`last_location_lat/lng`) rather than a dedicated table; `schedules` and `complaints` are in a separate migration file that `migrate.ts` may not apply (to be checked against a Postgres instance, not yet verified).

The file-backed store holds the same entities in `.data/database.json` and is development-only.

## Existing Mongoose stub (`server/db/mongodb.ts`)
Unused and incomplete (string foreign keys, embedded stops, no indexes). It will be replaced, not extended.

## MongoDB models (Implemented in `apps/api/src/infra/mongo/models`; not used by the running app)
Models are bound to a connection (`createModels(conn)`), indexes are created by `ensureIndexes`. Ten collections: `users`, `buses`, `routes` (stops embedded, GeoJSON points), `schedules`, `trips`, `vehiclelocations`, `telemetries`, `notifications`, `emergencyalerts`, `auditevents`.

| Collection | Constraints and indexes (all verified by `models-persistence.integration.test.ts`) |
|---|---|
| users | unique `{campusId, email}` (email lower-cased; per-campus, unlike the legacy global unique); `{campusId, role, status}`; `passwordHash` not selected by default; status PENDING/ACTIVE/REJECTED/DISABLED |
| buses | unique `{campusId, number}`; unique sparse `driverId` (a driver drives one bus); capacity integer 1..200 |
| routes | unique `{campusId, code}`; stop `order` unique within a route; stop coordinates validated; colour `#rrggbb` |
| schedules | time `HH:MM`, days 0..6, direction enum; `{campusId, routeId, departTime}` |
| trips | unique sparse `activeBusKey` and `activeDriverKey`, set only while ACTIVE; `{campusId, startedAt:-1}`, `{driverId, startedAt:-1}`, `{busId, startedAt:-1}` |
| vehiclelocations | unique `busId` (one latest position per bus) |
| telemetries | unique `{tripId, eventId}`; `{tripId, capturedAt}`; `{busId, capturedAt:-1}`; `{receivedAt}` for retention |
| notifications / emergencyalerts / auditevents | enum and length validation; `{campusId, createdAt:-1}`, `{campusId, status, createdAt:-1}`, `{campusId, at:-1}` |

Design choices and why:
- **No TTL index, no partial index, no transactions.** Retention uses an explicit purge; active-trip uniqueness uses the sparse-key pattern; every write that must be atomic is a single-document operation. This keeps the code portable and testable on any MongoDB-compatible engine.
- Pagination: `page` / `pageSize` with `pageSize` clamped to 1..100.
- Every repository query takes `campusId` from the authenticated principal.

Not yet implemented: user/route/bus/schedule CRUD repositories and HTTP routes, refresh tokens collection, audit writing, notification delivery.

## What the tests ran against
All Mongo tests in this repository were run in the sandbox against **FerretDB 1.24 (a MongoDB wire-protocol server backed by PostgreSQL), not MongoDB**, because MongoDB binaries cannot be downloaded there. CI is configured with a real `mongo:7` service, but CI has not run yet. Treat "verified on real MongoDB" as **not yet established**.
