# CampusBus domain glossary
Canonical names from apps/api. Use these exact names in code. Legacy names are listed as deprecated.

| Entity | Canonical name (code / table) | Definition |
|---|---|---|
| Campus | CampusDTO / v1.campuses | Tenant boundary. Every row carries campusId. Deprecated legacy name: colleges |
| User | UserDTO / v1.users | Account. Role: STUDENT, DRIVER, ADMIN. Status: PENDING, ACTIVE, REJECTED, DISABLED |
| Principal | Principal | Identity from an access token: userId, campusId, role, sessionId |
| Session | v1.refresh_tokens.family_id | Refresh-token family. The access token's sid claim is this id. revoked_reason: LOGOUT, REVOKED, REUSE |
| Bus | BusDTO / v1.buses | Vehicle. Status: ACTIVE, MAINTENANCE, OFFLINE |
| Route | RouteDTO / v1.routes | Ordered path of stops |
| Stop | StopDTO / v1.stops | Named point with lat, lng, order. Linked to trips through v1.trip_stops |
| Trip | TripDTO / v1.trips | One run of a bus. Status: ACTIVE, COMPLETED, CANCELLED. Mode: REAL, SIMULATED |
| Telemetry | TelemetryRecord / v1.telemetry | One GPS ping, with eventId, capturedAt, receivedAt. Deprecated legacy name: locations |
| Vehicle location | VehicleLocationDTO / v1.vehicle_locations | Latest live position of a bus on a trip |
| Schedule | ScheduleDTO / v1.schedules | Direction: TO_CAMPUS, FROM_CAMPUS |
| Notification | NotificationDTO / v1.notifications | Kind: ANNOUNCEMENT, DELAY, ROUTE_CHANGE, EMERGENCY. Priority: NORMAL, HIGH, URGENT |
| Emergency alert | EmergencyAlertDTO / v1.emergency_alerts | Status: OPEN, ACKNOWLEDGED, RESOLVED |
| Complaint | Complaint / v1.complaints | Status: OPEN, IN_PROGRESS, RESOLVED, CLOSED. Priority: LOW, NORMAL, HIGH |
| Email token | EmailTokenRepository / v1.email_tokens | Verification and reset codes |

**Deprecated: the legacy `server/` tree** (top-level `server/`, `server.ts`, `server/db/schema.sql`). It is not deployed. Root tests still import it, so it is not being retired in this setup. Do not add new code there. Put new work in `apps/api/`.
