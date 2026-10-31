import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

describe('package-lock.json gcp-metadata', () => {
  it('pins mongoose optional peer gcp-metadata@7.0.1 so npm ci can resolve it', () => {
    const nested = lock.packages?.['node_modules/mongoose/node_modules/gcp-metadata'];
    expect(nested).toBeTruthy();
    expect(nested.version).toBe('7.0.1');
    expect(nested.resolved).toMatch(/gcp-metadata-7\.0\.1\.tgz/);
  });
});
