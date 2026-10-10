# Security

Status as of branch `feature/mern-rebuild` (commit after `57895a3`). "Verified" means covered by an executed test or command.

## Fixed on this branch
| Issue | Fix | Evidence |
|---|---|---|
| Hardcoded JWT secret fallback | Production throws if `JWT_SECRET` is missing or under 32 chars; non-production uses a random per-process secret | `tests/auth-secret.test.ts` (4), prod boot without secret exits with FATAL |
| Silent file-database fallback in production | Production requires `DATABASE_URL` and aborts on connection failure | `scripts/test-prod-hardening.ts` 4/4 |
| `cors({ origin: true, credentials: true })` | Explicit allowlist from `CORS_ORIGIN`, shared by REST and Socket.IO; wildcard rejected; HTTPS required in production | `tests/cors.test.ts` (11); mutation check: test fails if the allowlist is bypassed |
| `rejectUnauthorized: false` on PostgreSQL TLS | Verified TLS by default in production, optional private CA, certificate checked against the host actually dialed | `tests/tls.test.ts` (5) plus `tests/pg-tls.integration.test.ts` (4) against a real TLS Postgres with a private CA: trusted CA connects, untrusted chain refused, IP-literal mismatch refused, wrong DNS name refused |
| Fabricated analytics numbers | Removed; unmeasured metrics are `null` | `tests/analytics.test.ts` (3) |
| `source-map-js` DoS advisory | 1.2.1 to 1.2.2 | `npm audit`: 0 vulnerabilities |
| `schedules` / `complaints` tables missing from PostgreSQL schema | Added to `schema.sql` | `tests/pg-schema.integration.test.ts` against a real Postgres |

Found while testing: `node-postgres` does not give Node's TLS layer the real hostname when the host is an IP literal, so the identity check silently falls back to `localhost`. `server/db/tls.ts` now binds the check to the host in `DATABASE_URL`.

## Not yet verified against Render
No managed-provider connection has been tried. Render's external Postgres certificate may need `DATABASE_CA_CERT`; its internal URL is on a private network and may require `DATABASE_SSL_MODE=disable` set explicitly. Both are configuration, not code. Do not deploy this branch to the live service without testing the connection in a staging environment first, because the old behavior was `rejectUnauthorized: false` and the new default is strict.

## Open findings (not fixed yet)
1. JWT lives in `localStorage`, 7-day lifetime, no refresh or revocation.
2. bcryptjs hashing (target Argon2id).
3. No email verification or password reset; no rate limits on auth beyond what exists in routes (to be audited).
4. No Zod request validation, no Helmet, no CSRF (not needed for Bearer tokens, required once cookies are used).
5. No audit log of administrative actions.
6. GPS ingest authorization gaps listed in `ARCHITECTURE.md` section 2.
7. `adminService.broadcastNotification` defaults `collegeId` to the literal `'college_apex'`.
8. `api/index.ts` serverless entry still exists and still shares the same routes; it cannot run Socket.IO.
9. Both `package-lock.json` and `bun.lock` are committed.

## Privacy
GPS data and student records are tenant-scoped by `college_id`. Retention for `locations` is not implemented. Rules are in `DATABASE.md` (proposed TTL).
