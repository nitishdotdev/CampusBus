# Testing CampusBus

Run `npm ci`, `npm run lint`, and `npm test`. Unit tests run without services. The API integration suites exercise Express, Socket.IO and the shipping repositories on PostgreSQL, including account and refresh lifecycle, assignment integrity, trip transitions, GPS, schedule validation and complaints.

| Test variable | Purpose |
| --- | --- |
| `PG_TEST_URL` | Disposable loopback PostgreSQL database with a name ending in `_test`. The user needs permission to create disposable child databases. |
| `PG_TLS_TEST_URL` | Separate PostgreSQL instance with TLS enabled. Its hostname must match the certificate SAN. |
| `PG_TLS_TEST_CA_FILE` | Test CA used to verify the TLS server. |
| `PG_TLS_TEST_WRONG_DNS_URL` | Resolvable alias with a hostname absent from the server certificate. |
| `CI_REQUIRE_INTEGRATION=1` | Fails CI if any test prerequisite is absent. |

The CI workflow provisions PostgreSQL 16 and a TLS-enabled PostgreSQL instance with a private test CA. It runs both builds and the npm vulnerability audit. The PostgreSQL v1 suite includes idempotent migration checks. The retained historical SQL tests are useful for assessing old database imports.

For a browser run, create a disposable campus, one account per role, at least one stop sequence and a bus assignment, then use the frontend production build against the local API. Exercise both deep links and reloads after logging in. Wait for the route's own rendered content, capture console and HTTP errors, and test at 360, 390, 768, 1024, and 1440 CSS pixels. Capture empty and active states when possible. Use a separate device for physical GPS and Chrome 109 validation.

Current commands for build and dependency checks:

```sh
VITE_API_V1_URL=https://api.example.edu npm run build
npm run api:build
npm audit --audit-level=high
```
