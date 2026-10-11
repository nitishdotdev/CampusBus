import { describe, expect, it } from 'vitest';

// In CI the integration suites must actually run; otherwise "all green" would just mean "everything skipped".
describe.skipIf(!process.env.CI_REQUIRE_INTEGRATION)('CI integration prerequisites', () => {
  it.each(['PG_TEST_URL', 'MONGODB_TEST_URI', 'PG_TLS_TEST_URL', 'PG_TLS_TEST_CA_FILE'])('%s is configured', (name) => {
    expect(process.env[name], `${name} must be set when CI_REQUIRE_INTEGRATION=1`).toBeTruthy();
  });
});
