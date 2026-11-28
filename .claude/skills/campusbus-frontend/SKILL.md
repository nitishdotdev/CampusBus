---
name: campusbus-frontend
description: Load when editing src/services/v1/ (client, auth) or React pages under src/pages/.
---
- All API calls go through v1Client (src/services/v1/client.ts). It has a 15 s timeout (REQUEST_TIMEOUT_MS) and throws ApiV1Error with codes REQUEST_TIMEOUT or NETWORK_ERROR.
- Logout: logoutV1 keeps the refresh token in sessionStorage under campusbus_pending_logout until the server confirms. flushPendingLogoutV1 runs on App mount.
- Unknown routes render NotFoundPage (src/pages/NotFoundPage.tsx). Do not redirect silently.
- Map error codes to user text in src/services/v1/auth.ts (humanizeError).
