import fs from 'fs';
import net from 'net';
import tls from 'tls';
import type { ConnectionOptions } from 'tls';
import { parse as parseConnectionString } from 'pg-connection-string';

/**
 * PostgreSQL connection + TLS policy.
 *
 * node-postgres lets TLS parameters inside DATABASE_URL (sslmode=..., ssl=...) OVERRIDE the `ssl` option passed in code.
 * Verified on pg 8.23: `?sslmode=no-verify` silently turned verification off and `?sslmode=disable` produced a plaintext
 * connection even though a strict `ssl` object was supplied. So this module removes every TLS parameter from the URL and
 * applies TLS only from explicit configuration:
 *
 *   DATABASE_SSL_MODE (default: verify in production, disable otherwise)
 *     verify           validate certificate chain AND the host actually dialed (system CAs + optional DATABASE_CA_CERT[_FILE]).
 *                      Use for external/public connections (Render external URL: always TLS, Render-managed certificates).
 *     encrypt-private  TLS without certificate verification. ONLY accepted for private-network hosts (single-label hostnames
 *                      such as Render's internal `dpg-xxxx-a`, localhost, loopback and RFC1918 addresses). Render documents that
 *                      internal connections use self-signed certificates, so sslmode=verify-* cannot work there and
 *                      sslmode=require (encrypted, unauthenticated) is its guidance.
 *     disable          plaintext. Development, or a private-network host. Never for a public host in production.
 *
 * There is deliberately no mode that skips verification for a public host.
 */

const TLS_URL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl', 'sslcompression', 'uselibpqcompat'];
const WEAK_URL_MODES = new Set(['disable', 'allow', 'prefer', 'no-verify']);

export interface PgConnectionConfig {
  connectionString: string;
  ssl: false | ConnectionOptions;
  mode: 'verify' | 'encrypt-private' | 'disable';
  host: string | undefined;
}

/** Private-network host: single-label name (no dots), localhost, loopback, RFC1918 / ULA / link-local addresses. */
export function isPrivateHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  const kind = net.isIP(h);
  if (kind === 4) {
    const [a = 0, b = 0] = h.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (kind === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return !h.includes('.'); // single-label hostname, resolvable only on a private network
}

export function buildPgConnection(env: NodeJS.ProcessEnv, rawUrl: string): PgConnectionConfig {
  const isProduction = env.NODE_ENV === 'production';
  // 1. Strip TLS parameters from the URL; refuse weakening ones in production instead of silently ignoring them.
  const u = new URL(rawUrl);
  const urlMode = u.searchParams.get('sslmode')?.toLowerCase();
  if (isProduction && urlMode && WEAK_URL_MODES.has(urlMode)) {
    throw new Error(`FATAL: DATABASE_URL contains sslmode=${urlMode}, which weakens TLS. Remove it and use DATABASE_SSL_MODE.`);
  }
  for (const p of TLS_URL_PARAMS) u.searchParams.delete(p);
  const connectionString = u.toString();
  // Parse only the sanitized URL: pg-connection-string reads files named by sslrootcert/sslcert/sslkey while parsing.
  const host = parseConnectionString(connectionString).host ?? undefined;
  const isPrivate = isPrivateHost(host);

  // 2. Choose the mode from explicit configuration only.
  const mode = (env.DATABASE_SSL_MODE || (isProduction ? 'verify' : 'disable')).toLowerCase();

  if (mode === 'disable') {
    if (isProduction && !isPrivate) {
      throw new Error('FATAL: DATABASE_SSL_MODE=disable is not permitted for a public database host in production.');
    }
    if (isProduction) console.warn('[db] WARNING: DATABASE_SSL_MODE=disable in production; private-network connection is NOT encrypted.');
    return { connectionString, ssl: false, mode: 'disable', host };
  }

  if (mode === 'encrypt-private') {
    if (!isPrivate) {
      throw new Error(`FATAL: DATABASE_SSL_MODE=encrypt-private skips certificate verification and is only allowed for private-network hosts (got "${host}"). Use "verify" for public hosts.`);
    }
    console.warn('[db] TLS enabled without certificate verification (private-network host). Traffic is encrypted but the server is not authenticated.');
    return { connectionString, ssl: { rejectUnauthorized: false }, mode: 'encrypt-private', host };
  }

  if (mode !== 'verify') {
    throw new Error(`FATAL: DATABASE_SSL_MODE must be "verify", "encrypt-private" or "disable" (got "${mode}"). A bypass for public hosts is not supported.`);
  }

  const opts: ConnectionOptions = { rejectUnauthorized: true };
  const inline = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  if (inline) opts.ca = inline;
  else if (env.DATABASE_CA_CERT_FILE) opts.ca = fs.readFileSync(env.DATABASE_CA_CERT_FILE, 'utf-8');

  if (isProduction && isPrivate && !opts.ca) {
    throw new Error(`FATAL: "${host}" is a private-network host, where managed providers (e.g. Render internal URLs) use self-signed certificates that cannot be verified. Set DATABASE_SSL_MODE=encrypt-private, or supply the server's CA via DATABASE_CA_CERT.`);
  }
  // node-postgres does not pass the dialed host to Node's TLS layer for IP literals (identity check falls back to "localhost").
  if (host) opts.checkServerIdentity = (_ignored, cert) => tls.checkServerIdentity(host, cert);
  return { connectionString, ssl: opts, mode: 'verify', host };
}
