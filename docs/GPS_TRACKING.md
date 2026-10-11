# GPS tracking (apps/api)

Implemented and tested in `apps/api`. It is **not yet wired to the legacy app or the React frontend**; nothing here is live.

## Pipeline
```
driver device -> POST /api/v1/telemetry (Bearer access token)
  -> authorize (role, account, trip, vehicle) -> validate each event -> telemetry (history, idempotent)
  -> vehicleLocations (latest, conditional atomic write) -> Socket.IO room bus:<campus>:<bus> (authorised subscribers)
students/admins: GET /api/v1/buses/:id/live (snapshot + freshness) and socket subscribe:bus
```

## Authorization rules (all server-side; request bodies never supply identity)
| Rule | Where | Test |
|---|---|---|
| Only `DRIVER` accounts, status `ACTIVE`, may report | `ingest.ts` | students/admins 403, disabled and nonexistent accounts 403 |
| The trip must belong to the caller; others' trips and unknown ids are both `404 TRIP_NOT_FOUND` (no id probing) | `ingest.ts` | unrelated driver, unassigned driver, cross-campus trip, malformed ids |
| The caller must still be the bus's assigned driver (`VEHICLE_ASSIGNMENT_REVOKED` otherwise) | `ingest.ts` | unassigned mid-trip |
| Trips start only on the caller's own bus | `trips.ts` | wrong bus 403 |
| `isSimulated` is not accepted from clients (strict schemas reject it). Trip `mode` is set by the server; `SIMULATED` only if `SIMULATION_MODE=on`, which the config loader refuses when `NODE_ENV=production` | `validation.ts`, `config/env.ts`, `trips.ts` | top-level and per-event flag, disabled/enabled server, production config |
| Observers: ADMIN (own campus), DRIVER (own bus), STUDENT (assigned bus or any bus on assigned route); inactive accounts never | `access.ts` | unit matrix, REST and socket tests |
| Sockets: token only in the handshake `auth` payload (not the URL); no automatic rooms; each subscription is authorised; max 20 per socket; connection closed when the access token expires | `gateway.ts` | unauthenticated/expired/URL-token, unrelated student/driver/other campus, lurker, reconnect |

## Event validation and ordering
- Envelope: `{tripId, events[1..50]}`, strict. Event: `{eventId, lat, lng, accuracyM?, speedMps?, headingDeg?, capturedAt}`, strict. Body limit 64 kB.
- Each event is judged on its own; a bad event is reported as `rejected` with a reason and does not block the rest (offline queues cannot be poisoned by one bad row).
- `capturedAt` is untrusted. The server records `receivedAt` itself. Rejected: more than 10 s in the future, older than 24 h, before the trip started (5 s skew), after the trip ended (for late sync), (0,0), out-of-range values, accuracy over 1000 m, speed over 70 m/s, heading over 360.
- Implied speed between two accepted fixes above 80 m/s and more than 100 m apart is `IMPLAUSIBLE_JUMP`.
- Speed is never invented: device value (`device`), else derived from the previous fix 1 to 120 s earlier (`derived`), else `null` (`unavailable`).
- Batches are processed oldest first regardless of arrival order.
- Idempotency: unique `(tripId, eventId)`. A retry returns `duplicate`, stores nothing, broadcasts nothing.
- Rate limit: 120 events per driver per minute by default (a batch costs its size), `429 RATE_LIMITED`. In-process only.

## Latest position vs history
- `telemetry`: append-only history, every accepted event.
- `vehicleLocations`: one document per bus. Written with a conditional atomic update that succeeds only when the new `capturedAt` is strictly newer. An event may go live only if all hold: trip is ACTIVE, received within 30 s of capture, accuracy 200 m or better. Older, low-accuracy, queued, duplicate and ended-trip events are history only and are never broadcast.

## When a location is stale
Position age = now minus the **earlier** of `capturedAt` and `receivedAt` (a device clock can make data look older, never fresher).

| State | Condition |
|---|---|
| `UNAVAILABLE` | no position stored for the bus |
| `TRIP_ENDED` | the bus has no active trip (last position is history) |
| `LIVE` | active trip, age at most 20 s |
| `STALE` | active trip, 20 s to 120 s |
| `DRIVER_OFFLINE` | active trip, over 120 s |

The thresholds assume the 3 s foreground target (`FRESHNESS_THRESHOLDS` in `freshness.ts`).

## Trips, late sync and retention
- At most one ACTIVE trip per bus and per driver (unique sparse keys present only while active), enforced atomically; starting and ending are single-document operations.
- Ended trips: events captured **inside the trip window** are accepted as history-only for 6 hours after the trip ended (so a driver's offline queue is not lost); anything else gets `409 TRIP_NOT_ACTIVE` or `AFTER_TRIP_END`. This is a deliberate deviation from "reject everything for ended trips".
- Trip history (the `trips` documents) is kept indefinitely. Telemetry history is kept `TELEMETRY_RETENTION_DAYS` (default 90) via `purgeReceivedBefore`. **Nothing schedules the purge yet**; it must be run by a job (to be added).

## Known limitations
1. Subscriptions are authorised when requested. If an account is disabled or reassigned afterwards, existing subscribers keep receiving until they disconnect or their token expires (15 minutes by default).
2. The rate limiter is per process; several API instances need a shared store.
3. Insert-then-apply is not transactional. A crash between the two leaves history without a live update; the next event repairs it.
4. No geofence beyond coordinate validity.
5. No token issuance, login, refresh, or user management in `apps/api` yet; tests mint tokens directly.
6. The browser queue (IndexedDB), driver UI and map are not connected to this API.
