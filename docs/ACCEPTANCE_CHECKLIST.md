# CampusBus acceptance checklist

## Verified in the disposable environment

- [x] Repository installs with `npm ci`. TypeScript, frontend production build, and standalone API bundle pass.
- [x] The API test harness uses the same PostgreSQL repository implementation as Render. CI requires the PostgreSQL and TLS settings and executes all integration suites.
- [x] Reapplying the v1 schema preserves staged records. A bundled production-mode process connected over verified PostgreSQL TLS and returned a healthy campus directory with the configured CORS origin.
- [x] Integration coverage includes role and campus authorization, refresh rotation, assignments, trip start/end, occupancy, stop arrival, GPS ingestion, Socket.IO, schedule validation, and complaint lifecycle.
- [x] Authenticated browser route coverage includes desktop and mobile viewport widths. The browser evidence archive records individual route outcomes.
- [x] The local npm audit returned zero vulnerabilities.

## Release gates

- [ ] Hosting owner confirms the exact Render service, Vercel project, preview settings and production origin. The connected Vercel preview reported a deployment failure. The public project domain served a Flutter application when checked.
- [ ] Hosting owner confirms the current production database revision and checks for pre-v1 records. Validate the additive migration and rollback on a staging copy before an approved production rollout.
- [ ] Validate map tile loading in the intended hosted browser environment. Local Chromium rejected the cloud proxy certificate for the tile host and verified the fallback.
- [ ] Test physical-device GPS and Chrome 109. The build targets Chrome 109 and the browser evidence uses Chromium 156 with device emulation.
- [ ] Confirm the desired hosted session and password recovery configuration. Refresh tokens are scoped to browser tabs. Email recovery requires a delivery adapter.
- [ ] Run authenticated post-deploy checks for each role on the approved deployment. No production deploy or database writes were performed during this review.
