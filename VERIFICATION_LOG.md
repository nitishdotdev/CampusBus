# PR 1 verification

- Upstream baseline installed with `npm ci`. Type checking, both builds and baseline Vitest passed. Baseline Vitest ran 408 tests and skipped 5 TLS cases before the complete TLS environment was bound.
- Candidate Vitest passed 469 tests across 56 files with no skips. Checks use repository Vitest with disposable PostgreSQL and a separate verified TLS instance. The targeted alert test covers administrator visibility, driver and campus isolation, idempotent concurrent delivery, acknowledgement and resolution.
- Chromium 156 and Chromium 109 verified a real IndexedDB version-1 upgrade, a blocked upgrade followed by recovery, preservation of existing and in-memory fixes, scoped quarantine, purge, and rejection by a lower-version open call.
- Chromium 156 read a real cross-origin telemetry `Retry-After` header and submitted an emergency while an end-trip request was held. An intercepted response simulated a timeout after the server stored the alert. The UI stayed uncertain until the exact alert arrived, then reflected open, acknowledged and resolved states.
- GPS inputs in the browser runs were emulated. Physical-device tracking and a hosted rollback rehearsal remain outside this run.
