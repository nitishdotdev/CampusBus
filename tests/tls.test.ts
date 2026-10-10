import { describe, it, expect } from 'vitest';
import { buildPgSsl } from '../server/db/tls';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('buildPgSsl', () => {
  it('defaults to verified TLS in production', () => {
    const ssl = buildPgSsl(env({ NODE_ENV: 'production' }));
    expect(ssl).toMatchObject({ rejectUnauthorized: true });
  });
  it('never returns rejectUnauthorized=false', () => {
    for (const mode of ['verify', 'VERIFY']) {
      const ssl = buildPgSsl(env({ NODE_ENV: 'production', DATABASE_SSL_MODE: mode }));
      expect((ssl as any).rejectUnauthorized).toBe(true);
    }
  });
  it('rejects bypass-style modes', () => {
    for (const mode of ['no-verify', 'require', 'allow', 'false']) {
      expect(() => buildPgSsl(env({ NODE_ENV: 'production', DATABASE_SSL_MODE: mode }))).toThrow(/bypass is not supported/);
    }
  });
  it('uses an inline CA with \\n escapes', () => {
    const ssl = buildPgSsl(env({ NODE_ENV: 'production', DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----' })) as any;
    expect(ssl.ca).toContain('\nABC\n');
  });
  it('is off by default outside production, and only off in production when explicit', () => {
    expect(buildPgSsl(env({ NODE_ENV: 'development' }))).toBe(false);
    expect(buildPgSsl(env({ NODE_ENV: 'production', DATABASE_SSL_MODE: 'disable' }))).toBe(false);
  });
});
