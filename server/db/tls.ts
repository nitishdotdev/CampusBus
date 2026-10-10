import fs from 'fs';
import tls from 'tls';
import type { ConnectionOptions } from 'tls';
import { parse as parseConnectionString } from 'pg-connection-string';

/**
 * PostgreSQL TLS configuration. Certificate verification is never disabled.
 *
 *   DATABASE_SSL_MODE = verify (default in production) | disable (default otherwise)
 *   DATABASE_CA_CERT  = PEM text (use \n escapes if stored on one line)   [optional]
 *   DATABASE_CA_CERT_FILE = path to a PEM file                            [optional]
 *
 * Pass the connection string so the certificate is verified against the host actually dialed.
 *
 * "verify" validates the server certificate chain AND hostname against the system trust
 * store plus the optional CA. If the provider uses a private CA, supply it via DATABASE_CA_CERT.
 * "disable" means plaintext and is only appropriate for a private network (e.g. a provider's
 * internal URL) or local development; it must be chosen explicitly in production.
 */
export function buildPgSsl(env: NodeJS.ProcessEnv = process.env, connectionString?: string): false | ConnectionOptions {
  const isProduction = env.NODE_ENV === 'production';
  const mode = (env.DATABASE_SSL_MODE || (isProduction ? 'verify' : 'disable')).toLowerCase();

  if (mode === 'disable') {
    if (isProduction) {
      console.warn('[db] WARNING: DATABASE_SSL_MODE=disable in production; connection is NOT encrypted.');
    }
    return false;
  }
  if (mode !== 'verify') {
    throw new Error(`FATAL: DATABASE_SSL_MODE must be "verify" or "disable" (got "${mode}"). Certificate-verification bypass is not supported.`);
  }

  const opts: ConnectionOptions = { rejectUnauthorized: true };
  const inline = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  const file = env.DATABASE_CA_CERT_FILE;
  if (inline) opts.ca = inline;
  else if (file) opts.ca = fs.readFileSync(file, 'utf-8');

  // node-postgres does not pass the real host to Node's TLS layer when the host is an IP literal,
  // which makes the hostname check fall back to "localhost". Verify against the actual host instead.
  const host = connectionString ? parseConnectionString(connectionString).host : undefined;
  if (host) {
    opts.checkServerIdentity = (_ignored, cert) => tls.checkServerIdentity(host, cert);
  }
  return opts;
}
