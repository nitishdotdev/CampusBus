# Architecture

| Layer | Current implementation |
| --- | --- |
| Browser | React and Vite. Browser history routes run through the authenticated shell and restore the tab session before mounting role-specific views. |
| API | `apps/api/src/server.ts` serves the v1 Express endpoints and the Socket.IO gateway. Development runs the same entry point with tsx. Render runs its compiled bundle. |
| Persistence | `apps/api/src/infra/postgres` implements the repository ports. SQL queries scope campus resources to the authenticated campus. |
| Domain | `apps/api/src/domain` handles access, trip ownership, GPS plausibility, and freshness. |

Vite proxies HTTP and WebSocket requests during local development. Production uses the configured API origin. Vercel builds only the frontend and the API is built separately into `dist-api`.

The bus row holds the authoritative driver and route assignment. Driver directory fields derive from that relationship. Student transport preferences remain on the user row. PostgreSQL serializes assignment and trip start on the bus row, and unique indexes enforce a single active trip per bus and driver. A route is live when it has a real active trip with a fresh fix. An active trip with limited tracking has a separate status. Vehicle availability is independently controlled by dispatch.

Trip start snapshots the ordered stop list. Accepted, fresh positions can confirm the next stop under the trip lock. Stale fixes and low-accuracy fixes cannot advance that stop. The next stop and completed stops are read from the same persisted trip state. The browser only renders an approximate ETA when an authorized, fresh position and measured or derived movement speed are available.

Complaint states progress from open to in progress or resolved, then closed. PostgreSQL conditions the update on the previous state. Students see their own records and administrators see only records in their campus. Response, resolution and closure timestamps have separate meanings.

GPS fixes queue by authenticated driver and original trip. IndexedDB survives a page reload. The API retains eligible late history without moving a live position backwards. Access tokens stay in memory. Rotating refresh tokens use browser session storage to support reloads across split origins. That storage is accessible to same-origin script. Moving refresh tokens to HttpOnly cookies requires an agreed same-site or reverse-proxy deployment.

The historical `server/` implementation and its schema fixtures remain available to inspect pre-v1 data and validate migration assumptions. It is outside the default web build, development workflow and Vercel deployment.
