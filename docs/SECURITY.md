# Security

Status as of branch `campusmove-mern-rebuild-d9c7ac4` (commit after `57895a3`). "Verified" means covered by an executed test or command.

## Fixed on this branch
| Issue | Fix | Evidence |
|---|---|---|
| Hardcoded JWT secret fallback | Production throws if `JWT_SECRET` is missing or under 32 chars; non-production uses a random per-process secret | `tests/auth-secret.test.ts` (4), prod boot without secret exits with FATAL |
| Silent file-database fallback in production | Production requires `DATABASE_URL` and aborts on connection failure | `scripts/test-prod-hardening.ts` 4/4 |
| `cors({ origin: true, credentials: true })` | Explicit allowlist from `CORS_ORIGIN`, shared by REST and Socket.IO; wildcard rejected; HTTPS required in production | `tests/cors.test.ts` (11); mutation check: test fails if the allowlist is bypassed |
| `rejectUnauthorized: false` on PostgreSQL TLS | Rebuilt as `buildPgConnection` (see below) | `tests/tls.test.ts` (5) plus `tests/pg-tls.integration.test.ts` (4) against a real TLS Postgres with a private CA: trusted CA connects, untrusted chain refused, IP-literal mismatch refused, wrong DNS name refused |
| Fabricated analytics numbers | Removed; unmeasured metrics are `null` | `tests/analytics.test.ts` (3) |
| `source-map-js` DoS advisory | 1.2.1 to 1.2.2 | `npm audit`: 0 vulnerabilities |
| `schedules` / `complaints` tables missing from PostgreSQL schema | Added to `schema.sql` | `tests/pg-schema.integration.test.ts` against a real Postgres |

### PostgreSQL TLS (rewritten after testing found three more problems)
1. **URL parameters override code.** On pg 8.23, `?sslmode=no-verify` in `DATABASE_URL` disabled verification even though a strict `ssl` object was passed; `?sslmode=disable` gave plaintext; `?sslmode=require` discarded a private CA. `buildPgConnection` now strips every TLS parameter from the URL, refuses weakening ones in production, and applies TLS only from `DATABASE_SSL_MODE`.
2. **IP-literal hosts** were checked against `localhost`. The identity check is now bound to the host actually dialed.
3. **`pg-connection-string` reads files named in `sslrootcert`/`sslkey`/`sslcert`** while parsing. Only the sanitized URL is parsed now.

Modes (per Render's documentation, `render.com/docs/postgresql-creating-connecting`): external URLs are always TLS with Render-managed certificates and `sslmode=disable` is rejected, so use `verify`. Internal URLs use self-signed certificates and Render states `verify-ca`/`verify-full` are unsupported there, so `encrypt-private` (encrypted, server not authenticated) is accepted **only** for private-network hosts (single-label names such as `dpg-xxxx-a`, localhost, loopback, RFC1918). It is rejected for any public host. There is no mode that skips verification for a public host (property-tested). `render.yaml` now sets `DATABASE_SSL_MODE=encrypt-private` because `fromDatabase` resolves the internal URL.

Evidence: `tests/tls.test.ts` (unit matrix incl. Render-shaped hostnames), `tests/pg-tls.integration.test.ts` (real TLS Postgres with a private CA: trusted CA connects; untrusted chain, IP mismatch and wrong DNS name refused; `sslmode=require` keeps the CA; `no-verify`/`disable` in the URL refused; `encrypt-private` encrypts). Removing the URL stripping makes 6 tests fail.

## Not yet verified against Render
No connection to Render has been made from this branch. Whether Render's external certificate chains to a public CA is not stated in the documentation I read; if verification fails, supply `DATABASE_CA_CERT`. Do not deploy this branch to the live service before testing the connection in staging: the old code used `rejectUnauthorized: false`, and production now refuses to start unless `DATABASE_SSL_MODE` matches the URL type.

## Added in apps/api (not live)
GPS ingestion authorization, server-controlled simulation, untrusted-timestamp handling, idempotency, rate limiting, authenticated Socket.IO with per-subscription authorization: see `GPS_TRACKING.md`. Access tokens are HS256 with pinned algorithm, issuer and audience, 15-minute default life, and the API refuses to start without `ACCESS_TOKEN_SECRET` (32+ characters, no development fallback).

## Open findings (not fixed yet)
1. JWT lives in `localStorage`, 7-day lifetime, no refresh or revocation.
2. bcryptjs hashing (target Argon2id).
3. No email verification or password reset; no rate limits on auth beyond what exists in routes (to be audited).
4. No Zod request validation, no Helmet, no CSRF (not needed for Bearer tokens, required once cookies are used).
5. No audit log of administrative actions.
6. The legacy GPS ingest (`server/routes/driver.ts`) still has the gaps in `ARCHITECTURE.md` section 2. The replacement exists in `apps/api` but is not connected.
7. `adminService.broadcastNotification` defaults `collegeId` to the literal `'college_apex'`.
8. `api/index.ts` serverless entry still exists and still shares the same routes; it cannot run Socket.IO.
9. Both `package-lock.json` and `bun.lock` are committed.

## Privacy
GPS data and student records are tenant-scoped by `college_id`. Retention for `locations` is not implemented. Rules are in `DATABASE.md` (proposed TTL).
