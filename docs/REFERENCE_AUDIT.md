# BUBT Bus Portal — reference audit

Source: `github.com/GracePranto/Bubt-Bus-Portal`, cloned and read on 2026-10-10 (10 commits). Findings below come from reading the code, not from running it.

## What it is
A Django 5 + SQLite single-page portal. One server-rendered page (`templates/index.html`) switches `<section>`s client-side (auth, student dashboard, admin dashboard, map, schedule, notices, complaints and their admin counterparts). A second page, `gps_sender.html`, is opened on a phone to broadcast location.

## Data model (`portal/models.py`)
`User(role: student|admin, university_id)`, `Bus(name, status, current_lat/lng, last_updated, color_hex)`, `RouteStop(bus, order, lat, lng)` with `unique(bus, order)`, `Schedule(bus, departure_time, direction, days)`, `Notice(priority low..urgent, is_active)`, `Complaint(status pending/reviewing/resolved/dismissed)`, `GPSLog(bus, lat, lng, accuracy, speed, timestamp)`. A route is a property of a bus (one route per bus). There is no driver, trip or tenant concept.

## Useful UX patterns to adapt (not copy)
| Pattern | Where | CampusMove use |
|---|---|---|
| Role-gated dashboard tiles leading to focused sections | `student-dashboard`, `admin-dashboard` | Already similar in `AppShell`; keep dashboards as launchpads |
| Map with a **Simulation** tab and a separate **Real-time** tab | `map_simulation.js`, `map_realtime.js` | Keep any demo mode in its own clearly labelled view, never mixed with real telemetry |
| Per-bus colour on marker, route polyline and stop circles, plus legend | `MapManager.drawRoutes/drawStops/drawLegend` | Route colour already exists (`route.color`); add a legend |
| Status line under the map: buses tracked, active in last 30 s, last poll time | `RealtimeTracker.poll` | Replace with explicit LIVE / STALE / OFFLINE per bus using server timestamps |
| Ordered stops with a unique `(route, order)` constraint | `RouteStop` | Enforce uniqueness of stop order within a route in the new schema |
| Day-of-week + direction schedule rows | `Schedule` | Matches our schedule model; add timetable by day |
| Notices with priority and an active flag | `Notice` | Matches our announcements; add expiry |
| Complaint workflow with admin status changes | `Complaint` | Already present in CampusMove |
| Phone sender page with permission prompt, `watchPosition`, high accuracy | `gps_sender.html` | Our driver portal is richer; the permission-then-watch flow is the same |

## Things the reference gets wrong (do not adopt)
1. **GPS ingest is unauthenticated.** `api_gps_update` and `api_gps_live` have no auth; anyone can move any bus or read all positions.
2. **Privilege escalation at signup.** `api_register` accepts `role=admin` from the request body.
3. **`@csrf_exempt` on every state-changing endpoint** with session cookies.
4. Hardcoded `SECRET_KEY`, `DEBUG = True`, `ALLOWED_HOSTS = ['*']`.
5. Polling every 3 s, no push, no staleness model, no offline queue, no trip lifecycle.
6. Repository contains `ngrok.exe` and an `.apk`.

## Decisions for CampusMove
- Reuse the information architecture and the two-mode map idea only.
- All of items 1–4 are already designed out of CampusMove (server-side roles, authenticated GPS, JWT secret enforcement) and each gets a regression test as the new backend lands.
