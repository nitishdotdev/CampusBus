---
name: campusbus-testing
description: Load when writing or running tests under tests/ or apps/api/tests/, or changing vitest.config.ts.
---
- Run: npm test (vitest run). Lint: npm run lint (tsc for root and apps/api).
- Integration suites use describe.skipIf(!PG_TEST_URL). CI sets CI_REQUIRE_INTEGRATION=1 with PG_TEST_URL, PG_TLS_TEST_URL, PG_TLS_TEST_CA_FILE, PG_TLS_TEST_WRONG_DNS_URL.
- apps/api/tests/harness.ts seeds users. Each seeded user has a live session with id harnessSessionId(userId). Use h.token() only for seeded users. For other users, log in first and use the returned access token.
- Stub repositories in unit tests must implement isFamilyActive.
- Frontend tests run in the node environment. Stub window.sessionStorage before importing client modules.
- Test files must be *.test.ts (.tsx is not picked up).
