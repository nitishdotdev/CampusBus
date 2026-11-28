# CampusBus acceptance checklist

## Verified in the disposable environment

- [x] Repository installs with `npm ci`. TypeScript, frontend production build, and standalone API bundle pass.
- [x] The API test harness uses the same PostgreSQL repository implementation as Render. CI requires the PostgreSQL and TLS settings and executes all integration suites.
- [x] Reapplying the v1 schema preserves staged records. A bundled production-mode process connected over verified PostgreSQL TLS and returned a healthy campus directory with the configured CORS origin.
- [x] Integration coverage includes role and campus authorization, refresh rotation, assignments, trip start/end, occupancy, stop arrival, GPS ingestion, Socket.IO, schedule validation, and complaint lifecycle.
- [x] Authenticated browser route coverage includes desktop and mobile viewport widths. The browser evidence archive records individual route outcomes.
- [x] The local npm audit returned zero vulnerabilities.

## Production evidence and release gates

- [x] The baseline frontend compiled with the live Render origin. Public health, the campus endpoint, browser CORS headers, login preflight, Engine.IO polling, and WebSocket upgrade were verified.
- [x] The live directory returned the existing RKGIT campus. The published coordinates fall within the mapped campus outline.
- [ ] Confirm the existing production database target, TLS mode, schema, record inventory and any legacy data through Render and Neon access.
- [ ] Verify `/healthz` is the explicit infrastructure health check on the existing Render service and monitor `/readyz` separately. Confirm Preview has its own Vercel API origin and review all checks on the follow-up PR.
- [ ] Approve a production sender and validate real recovery email to an authorized inbox. Confirm a reset ends the previous refresh session. An already issued access token retains its normal expiry.
- [ ] Sign in with authorized student, driver and admin accounts on the approved deployment. Check campus selection, data isolation, notifications, authenticated tracking and session restore. Confirm map tiles in the hosted browser.
- [ ] Test GPS on a moving physical phone with location permission, interruption and reconnect. Verify Chrome 109 on the institution's supported devices after deployment.

Validate the branch with `npm run lint`, the PostgreSQL and TLS suites in [CI](../.github/workflows/ci.yml), `VITE_API_V1_URL=https://campusmove-nahp.onrender.com npm run build`, `npm run api:build` and `npm audit --audit-level=high`.
