import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test', MONGODB_TEST_URI: process.env.MONGODB_TEST_URI ?? '', PG_TEST_URL: process.env.PG_TEST_URL ?? '', PG_TLS_TEST_URL: process.env.PG_TLS_TEST_URL ?? '', PG_TLS_TEST_CA_FILE: process.env.PG_TLS_TEST_CA_FILE ?? '', PG_TLS_TEST_WRONG_DNS_URL: process.env.PG_TLS_TEST_WRONG_DNS_URL ?? '', CI_REQUIRE_INTEGRATION: process.env.CI_REQUIRE_INTEGRATION ?? '', ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'test-access-secret-test-access-secret-12345678', REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-test-refresh-secret-1234567' },
    environment: 'node',
    include: ['tests/**/*.test.ts', 'apps/api/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 45000,
  },
});
