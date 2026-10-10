// Real-TLS verification against a PostgreSQL server using a private CA.
// Skipped unless PG_TLS_TEST_URL (host must match the cert SAN) and PG_TLS_TEST_CA_FILE are set.
// Example: PG_TLS_TEST_URL=postgres://postgres@localhost:54330/postgres PG_TLS_TEST_CA_FILE=/tmp/pgtls/certs/ca.crt npm test
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { buildPgSsl } from '../server/db/tls';

const URL_ = process.env.PG_TLS_TEST_URL;
const CA = process.env.PG_TLS_TEST_CA_FILE;
const env = (extra: Record<string, string>) => ({ NODE_ENV: 'production', ...extra }) as unknown as NodeJS.ProcessEnv;

async function connect(url: string, ssl: any) {
  const pool = new Pool({ connectionString: url, ssl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    return rows[0].ssl as boolean;
  } finally {
    await pool.end();
  }
}

describe.skipIf(!URL_ || !CA)('PostgreSQL TLS verification (real server)', () => {
  it('connects over verified TLS when the CA is supplied', async () => {
    const ssl = buildPgSsl(env({ DATABASE_CA_CERT_FILE: CA! }), URL_!);
    expect(await connect(URL_!, ssl)).toBe(true);
  });
  it('refuses a server whose certificate chain is not trusted', async () => {
    await expect(connect(URL_!, buildPgSsl(env({}), URL_!))).rejects.toThrow(/self[- ]signed|unable to (get|verify)|certificate/i);
  });
  // The certificate only lists DNS:localhost, so an IP literal must be refused.
  it('refuses an IP-literal host that is not in the certificate', async () => {
    const ipUrl = URL_!.replace('localhost', '127.0.0.1');
    await expect(connect(ipUrl, buildPgSsl(env({ DATABASE_CA_CERT_FILE: CA! }), ipUrl))).rejects.toThrow(/altnames|IP|certificate/i);
  });
  // Optional: set PG_TLS_TEST_WRONG_DNS_URL to a different DNS name that resolves to the same server.
  it.skipIf(!process.env.PG_TLS_TEST_WRONG_DNS_URL)('refuses a DNS name that does not match the certificate', async () => {
    const u = process.env.PG_TLS_TEST_WRONG_DNS_URL!;
    await expect(connect(u, buildPgSsl(env({ DATABASE_CA_CERT_FILE: CA! }), u))).rejects.toThrow(/altnames|hostname|certificate/i);
  });
});
