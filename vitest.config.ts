import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'apps/api/tests/**/*.test.ts'],
    testTimeout: 20000,
  },
});
