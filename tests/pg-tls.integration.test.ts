// Real-TLS verification against a PostgreSQL server using a private CA.
// Skipped unless PG_TLS_TEST_URL (host must match the cert SAN) and PG_TLS_TEST_CA_FILE are set.
// Example: PG_TLS_TEST_URL=postgres://postgres@localhost:54330/postgres PG_TLS_TEST_CA_FILE=/tmp/pgtls/certs/ca.crt npm test
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { buildPgConnection } from '../server/db/tls';

const URL_ = process.env.PG_TLS_TEST_URL;
const CA = process.env.PG_TLS_TEST_CA_FILE;
const env = (extra: Record<string, string>) => ({ NODE_ENV: 'production', ...extra }) as unknown as NodeJS.ProcessEnv;
// NB: in production a private host (localhost here) would normally need encrypt-private or a CA; tests pass the CA explicitly.

// Connect exactly the way the application does: through buildPgConnection (URL TLS parameters stripped).
async function connect(url: string, extraEnv: Record<string, string> = {}) {
  const c = buildPgConnection(env(extraEnv), url);
  const pool = new Pool({ connectionString: c.connectionString, ssl: c.ssl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    return rows[0].ssl as boolean;
  } finally {
    await pool.end();
  }
}

describe.skipIf(!URL_ || !CA)('PostgreSQL TLS verification (real server, private CA)', () => {
  it('connects over verified TLS when the CA is supplied', async () => {
    expect(await connect(URL_!, { DATABASE_CA_CERT_FILE: CA! })).toBe(true);
  });
  it('refuses a server whose certificate chain is not trusted', async () => {
    await expect(connect(URL_!)).rejects.toThrow(/self[- ]signed|unable to (get|verify)|certificate/i);
  });
  // The certificate only lists DNS:localhost, so an IP literal must be refused.
  it('refuses an IP-literal host that is not in the certificate', async () => {
    await expect(connect(URL_!.replace('localhost', '127.0.0.1'), { DATABASE_CA_CERT_FILE: CA! })).rejects.toThrow(/altnames|IP|certificate/i);
  });
  // Optional: set PG_TLS_TEST_WRONG_DNS_URL to a different DNS name that resolves to the same server.
  it.skipIf(!process.env.PG_TLS_TEST_WRONG_DNS_URL)('refuses a DNS name that does not match the certificate', async () => {
    await expect(connect(process.env.PG_TLS_TEST_WRONG_DNS_URL!, { DATABASE_CA_CERT_FILE: CA! })).rejects.toThrow(/altnames|hostname|certificate/i);
  });
  it('honours the private CA even when the URL says sslmode=require (node-postgres would otherwise drop the CA)', async () => {
    expect(await connect(`${URL_}?sslmode=require`, { DATABASE_CA_CERT_FILE: CA! })).toBe(true);
  });
  it('REGRESSION: sslmode=no-verify or sslmode=disable in the URL cannot switch verification off in production', async () => {
    for (const m of ['no-verify', 'disable', 'allow', 'prefer']) {
      await expect(connect(`${URL_}?sslmode=${m}`, { DATABASE_CA_CERT_FILE: CA! }), m).rejects.toThrow(/weakens TLS/);
    }
  });
  it('encrypt-private gives an encrypted connection without a CA on a private host', async () => {
    expect(await connect(URL_!, { DATABASE_SSL_MODE: 'encrypt-private' })).toBe(true);
  });
});
