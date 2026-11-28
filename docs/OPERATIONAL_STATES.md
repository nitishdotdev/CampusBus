# Operational state inventory

| Area | Source of truth | Transitions and failure behavior |
| --- | --- | --- |
| Session | API session family and tab credentials | Loading, restored, signed out, or retry. A transient network failure keeps the protected URL. Auth rejection clears the session. |
| Account and assignment | PostgreSQL user, campus and vehicle assignment | Driver controls require the assigned vehicle and route. The API enforces campus, role and account boundaries for all mutations. |
| Vehicle | PostgreSQL operational status and active trip | Availability, maintenance and service status are separate from tracking quality. |
| Trip mutation | PostgreSQL trip and scoped trip read | Start and end have pending, confirmed and uncertain outcomes. Query the scoped active assignment after an uncertain start and the exact trip after an uncertain end. Only a confirmed completed trip opens the summary. |
| Local GPS | Browser geolocation and fix time | Permission, fix availability and accuracy describe the device. They do not predict the server verdict. |
| Telemetry verdict | API response and server capture/receipt policy | Live, history-only, rejected or duplicate. Future timestamps show a device-clock warning. |
| Queue and sync | IndexedDB, driver session and retry policy | Unsent, in flight, deferred, accepted or quarantined. Network and rate-limit failures retain data. Terminal rejections leave bounded metadata. Per-driver indexing limits scans. |
| Socket transport | Socket.IO connection lifecycle | Idle, connecting, connected, reconnecting or disconnected. Viewer pages can display the most recent REST position during a disconnect. |
| Tracking freshness | Stored active trip and latest authorized position | Server and browser share the 20-second live and 120-second offline boundaries. An ended trip never becomes live through recomputing age in the browser. |
| Map viewport | Leaflet events and user selection | Selecting a target moves the viewport. Panning pauses follow. Toggling follow or choosing Recenter resumes it for a bus. |
| Emergency | Server alert ID and status | Submission, uncertainty, open, acknowledged, failed and resolved are distinct. The browser checks the exact request ID and retries with the same ID. |
| ETA | Authorized live fix, speed and next stop | A straight-line approximation is available only when the fresh fix, moving speed and next stop are known. No timetable or simulated fix substitutes for a live estimate. |
| Analytics | API trip sample and current fleet | Recent trip summaries cover the latest 100 rows. Current active count and fleet size use the fleet response. |
| Dashboard refresh | Role-scoped API responses and page visibility | One periodic read at a time per mounted provider. Focused mutations may request an immediate refresh. Deep separation into resource stores remains follow-up work. |

## Compatibility

IndexedDB version 3 adds a compound driver/timestamp index without replacing either object store. A rollback must preserve the version-3 adapter and both stores. See the broader [recovery guidance](GPS_TRACKING.md#offline-database-deployment-and-recovery).
