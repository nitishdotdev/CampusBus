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

## Target MongoDB model (Proposed, not built)
| Collection | Key fields | Indexes |
|---|---|---|
| `campuses` | name, shortCode | unique `shortCode` |
| `users` | campusId, email, passwordHash, role, status (PENDING/ACTIVE/REJECTED/DISABLED), emailVerifiedAt, assignedRouteId?, assignedBusId? | unique `{campusId, email}` (decision: per-campus email uniqueness vs global, to be confirmed against existing data), `{campusId, role, status}` |
| `routes` | campusId, code, name, color, stops[{_id, name, location(GeoJSON Point), order}] | unique `{campusId, code}`; unique stop `order` enforced in validation |
| `buses` | campusId, number, capacity, status, driverId?, routeId? | unique `{campusId, number}`; unique sparse `driverId` |
| `schedules` | campusId, routeId, busId, direction, days[], departTime | `{campusId, routeId, days}` |
| `trips` | campusId, busId, driverId, routeId, status, startedAt, endedAt | partial unique `{busId}` and `{driverId}` where status ACTIVE |
| `vehicleLocations` | busId (unique), tripId, location, speed, heading, accuracy, recordedAt, receivedAt | unique `busId` |
| `telemetry` | eventId, tripId, busId, location, recordedAt, receivedAt | unique `{tripId, eventId}`; TTL on `receivedAt` (retention to be decided) |
| `notifications`, `announcements`, `emergencyAlerts`, `complaints` | campusId, status, timestamps | `{campusId, createdAt:-1}`, `{campusId, status}` |
| `auditLogs` | actorId, action, target, ip, at | `{campusId, at:-1}` |
| `refreshTokens` | userId, tokenHash, family, expiresAt, revokedAt | TTL on `expiresAt`, `{userId}` |

Tenancy is enforced by always including `campusId` from the authenticated principal in every query and in every socket room name.

Nothing in this section exists in code yet.
