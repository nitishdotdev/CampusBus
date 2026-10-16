# Testing

| Command | What it covers | Needs |
|---|---|---|
| `npm run lint` | `tsc` for the app and strict `tsc -p apps/api` | nothing |
| `npm test` | Vitest: policy, tokens, CORS, TLS config, analytics, JWT secret (always); integration suites below when their variables are set (otherwise skipped) | nothing for the base set |
| `npm run build` | production frontend and server bundle | nothing |
| `npm run test:verify` | legacy HTTP/Socket suite (53 checks) against a running dev server using the file-backed store | `NODE_ENV=development PORT=3000 npx tsx server.ts` running |
| `npx tsx scripts/test-prod-hardening.ts` | production refuses to start without DB/secrets | nothing |

## Integration suites (variables; never point them at production)
| Variable | Enables |
|---|---|
| `MONGODB_TEST_URI` (e.g. `mongodb://127.0.0.1:27017`) | `apps/api/tests/*.integration.test.ts`: GPS authorization, integrity, live access, sockets, models, persistence across reconnects. Each file creates and drops its own database |
| `PG_TEST_URL` | `tests/pg-schema.integration.test.ts` (legacy PostgreSQL schema, schedules/complaints) |
| `PG_TLS_TEST_URL`, `PG_TLS_TEST_CA_FILE`, optional `PG_TLS_TEST_WRONG_DNS_URL` | `tests/pg-tls.integration.test.ts` against a TLS-enabled Postgres with a private CA |
| `CI_REQUIRE_INTEGRATION=1` | makes the run fail if any of the above is missing |

## Results recorded so far
See `IMPLEMENTATION_STATUS.md`. Mongo-dependent results come from FerretDB 1.24, not MongoDB; CI uses `mongo:7` but has not run.

## Mutation checks
Security-critical rules were verified by deliberately breaking each one and confirming a test fails (driver ownership, role check, assignment check, timestamp bounds, live eligibility, ordering, duplicate detection, access policy, rate limit, socket authorization, token algorithm/issuer, TLS parameter stripping, retention purge, pagination clamp, single-active-trip keys). One mutant initially survived and exposed a freshness-rule inconsistency, now fixed.
