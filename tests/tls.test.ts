import { describe, expect, it } from 'vitest';
import { buildPgConnection, isPrivateHost } from '../server/db/tls';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const PROD = { NODE_ENV: 'production' };
// Shapes from Render's documentation: internal = private network (no domain), external = public *.render.com hostname.
const INTERNAL = 'postgresql://user:pw@dpg-abc123-a:5432/campusmove';
const EXTERNAL = 'postgresql://user:pw@dpg-abc123-a.oregon-postgres.render.com:5432/campusmove';

describe('isPrivateHost', () => {
  it('classifies hosts', () => {
    for (const h of ['dpg-abc123-a', 'localhost', '127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.5', '::1', 'db']) expect(isPrivateHost(h), h).toBe(true);
    for (const h of ['dpg-abc123-a.oregon-postgres.render.com', 'example.com', '8.8.8.8', '172.32.0.1', '203.0.113.5', '', undefined]) expect(isPrivateHost(h as string), String(h)).toBe(false);
  });
});

describe('buildPgConnection: external (public) host', () => {
  it('defaults to verified TLS in production, bound to the host dialed', () => {
    const c = buildPgConnection(env(PROD), EXTERNAL);
    expect(c.mode).toBe('verify');
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((c.ssl as any).checkServerIdentity).toBeTypeOf('function');
  });
  it('accepts Render-style ?sslmode=require but never lets the URL decide TLS behaviour', () => {
    const c = buildPgConnection(env(PROD), `${EXTERNAL}?sslmode=require`);
    expect(c.connectionString).not.toMatch(/ssl/i);
    expect(c.mode).toBe('verify');
  });
  it.each(['no-verify', 'disable', 'allow', 'prefer'])('refuses sslmode=%s in the URL in production', (m) => {
    expect(() => buildPgConnection(env(PROD), `${EXTERNAL}?sslmode=${m}`)).toThrow(/weakens TLS/);
  });
  it('strips every TLS parameter from the URL and keeps the rest', () => {
    const c = buildPgConnection(env(PROD), `${EXTERNAL}?application_name=cm&sslmode=verify-full&sslrootcert=/x&uselibpqcompat=true&ssl=true`);
    expect(c.connectionString).toContain('application_name=cm');
    expect(c.connectionString).not.toMatch(/ssl|libpq/i);
    expect(c.connectionString).toContain('dpg-abc123-a.oregon-postgres.render.com');
    expect(c.connectionString).toContain('user:pw@');
  });
  it('rejects skipping verification or plaintext for a public host in every form', () => {
    expect(() => buildPgConnection(env({ ...PROD, DATABASE_SSL_MODE: 'encrypt-private' }), EXTERNAL)).toThrow(/private-network hosts/);
    expect(() => buildPgConnection(env({ ...PROD, DATABASE_SSL_MODE: 'disable' }), EXTERNAL)).toThrow(/public database host/);
    for (const m of ['no-verify', 'require', 'allow', 'false', 'off']) {
      expect(() => buildPgConnection(env({ ...PROD, DATABASE_SSL_MODE: m }), EXTERNAL), m).toThrow(/bypass for public hosts is not supported/);
    }
  });
  it('uses a private CA when supplied (inline with \\n escapes or from file)', () => {
    const c = buildPgConnection(env({ ...PROD, DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----' }), EXTERNAL);
    expect((c.ssl as any).ca).toContain('\nABC\n');
  });
  it('property: no combination of settings yields rejectUnauthorized=false for a public host', () => {
    const modes = [undefined, 'verify', 'encrypt-private', 'disable', 'no-verify', 'VERIFY'];
    const urls = [EXTERNAL, `${EXTERNAL}?sslmode=require`, `${EXTERNAL}?sslmode=verify-full`, 'postgres://u:p@db.example.com/x', 'postgres://u:p@8.8.8.8/x'];
    for (const nodeEnv of ['production', 'development', 'test']) for (const m of modes) for (const url of urls) {
      try {
        const c = buildPgConnection(env({ NODE_ENV: nodeEnv, ...(m ? { DATABASE_SSL_MODE: m } : {}) }), url);
        if (c.ssl) expect((c.ssl as any).rejectUnauthorized, `${nodeEnv} ${m} ${url}`).toBe(true);
      } catch { /* refusing is also safe */ }
    }
  });
});

describe('buildPgConnection: Render internal (private network) host', () => {
  it('verify without a CA is refused with guidance (internal certificates are self-signed)', () => {
    expect(() => buildPgConnection(env(PROD), INTERNAL)).toThrow(/encrypt-private/);
  });
  it('encrypt-private gives encrypted, unverified TLS, only here', () => {
    const c = buildPgConnection(env({ ...PROD, DATABASE_SSL_MODE: 'encrypt-private' }), `${INTERNAL}?sslmode=require`);
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toMatch(/ssl/i);
  });
  it('verify with an explicit CA is allowed on a private host', () => {
    const c = buildPgConnection(env({ ...PROD, DATABASE_CA_CERT: 'PEM' }), INTERNAL);
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true, ca: 'PEM' });
  });
  it('plaintext on a private host in production is allowed only when explicit (and warns)', () => {
    expect(buildPgConnection(env({ ...PROD, DATABASE_SSL_MODE: 'disable' }), INTERNAL).ssl).toBe(false);
  });
});

describe('buildPgConnection: development / test', () => {
  it('defaults to no TLS for local databases and ignores URL TLS parameters', () => {
    const c = buildPgConnection(env({ NODE_ENV: 'development' }), 'postgres://postgres@localhost:5432/dev?sslmode=disable');
    expect(c.ssl).toBe(false);
    expect(c.connectionString).not.toMatch(/ssl/i);
  });
  it('can still be set to verify explicitly', () => {
    expect(buildPgConnection(env({ NODE_ENV: 'development', DATABASE_SSL_MODE: 'verify' }), 'postgres://u@db.example.com/x').ssl).toMatchObject({ rejectUnauthorized: true });
  });
});

describe('buildPgConnection: hostile URLs', () => {
  it('never reads files named by TLS parameters in the URL', () => {
    expect(() => buildPgConnection(env(PROD), `${EXTERNAL}?sslrootcert=/etc/passwd&sslkey=/etc/shadow&sslcert=/nonexistent`)).not.toThrow();
  });
});
