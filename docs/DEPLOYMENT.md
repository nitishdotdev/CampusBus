# Deployment

## Observed and declared configuration

The live frontend is `https://campus-bus-delta.vercel.app` and its bundle points to `https://campusmove-nahp.onrender.com`. The reviewed production baseline is `4ed2817e305586227d68a0b436758de0f7c3816b`. GitHub reports a successful Vercel deployment for that commit. The failed preview check on PR #10 predates the successful production deployment. Set `VITE_API_V1_URL` separately for every Vercel environment in use.

## Render settings for the reviewed release

| Field | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `npm ci && npm run api:build` |
| Start command | `npm run api:start` |
| Health check path | `/healthz` in Settings on the existing Render web service, after approval. The Blueprint already declares it. |
| Runtime | Node.js 22.12+ or 24 and `NODE_ENV=production` |
| `DATABASE_URL` | Existing approved PostgreSQL connection, set through managed secrets |
| `DATABASE_SSL_MODE` | `verify`. Supply a private CA only when required by the confirmed host. |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | Distinct existing secrets, at least 32 characters. Rotating them requires reauthentication. |
| `CORS_ORIGIN` | `https://campus-bus-delta.vercel.app`. List approved preview or custom origins explicitly if required. |
| `BOOTSTRAP_SECRET` | Leave unset unless explicitly authorizing initial HTTP provisioning. |
| `SIMULATION_MODE` | Leave unset or set `off`. |
| `EMAIL_FROM`, `RESEND_API_KEY` | Verified Resend sender and sending-only API key for the sender domain. Configure both through Render after approval. |

Use the established Render service and existing database. `/healthz` checks database connectivity and read access to the v1 campus table. It returns HTTP 503 if the probe fails and HTTP 200 for an empty table. Keep `/healthz` as Render's infrastructure health check. `/readyz` is the separate operational check. It returns HTTP 503 with `NO_CAMPUSES` for an empty table and HTTP 200 with `{"status":"ready"}` once a campus exists.

For password recovery, verify a sender domain with Resend, scope the API key to sending mail for that domain, and test delivery to an approved inbox. With no sender configured, sign-in explains that email recovery is unavailable and directs users to their campus administrator. The Render service uses in-process rate limits per account and IP. Before running multiple API instances, configure shared rate limits. Leave `EMAIL_VERIFICATION_REQUIRED` disabled until the separate registration verification flow is ready. Campus administrators can reset managed driver and student passwords.

## Vercel settings for the reviewed release

Set framework to Vite, use `npm run build`, and publish `dist` on the verified frontend project. Set the production `VITE_API_V1_URL` to `https://campusmove-nahp.onrender.com` without an API path. Use the approved staging API origin for Vercel Preview. The browser assets and router are published by Vercel. Keep the API bundle and email credentials on Render.

## Initial provisioning

1. Verify the database host, database name, and Neon project and branch against the binding on the existing Render production service. Use the same approved connection and TLS settings in a trusted, secret-managed shell. Run the read-only inventory below. It reports the database name, negotiated TLS, and visible tables, columns, and row counts. Check `v1`, `public`, and other application schemas for legacy tables and migration metadata. CampusBus applies its v1 schema as idempotent SQL and does not maintain a separate v1 migration history table.
2. Compare the public directory with the inventory. If RKGIT already exists, retain its ID and settings. Review any legacy records before attempting a separate import. If RKGIT is absent and the production target and existing v1 schema are confirmed, run the bootstrap below. `--existing-schema` performs provisioning against the installed schema. The short code is idempotent and the CLI leaves an existing record intact.
3. If a first campus administrator is needed, run the same bootstrap from a single trusted operator session with authorized `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` injected by the secret manager. The command preserves existing administrators. Treat the initial password as a temporary credential and distribute it through an approved channel. Keep `BOOTSTRAP_SECRET` unset for this CLI flow.

RKGIT is Raj Kumar Goel Institute of Technology in Ghaziabad, Uttar Pradesh, India. The published coordinates `28.7009194, 77.4425612` are inside the mapped campus outline. Zoom 16 gives a campus-level view. The current campus schema stores `city`, map coordinates, zoom and timezone. [Institute contact and map](https://rkgit.edu.in/contactus) · [OpenStreetMap campus outline](https://www.openstreetmap.org/way/1409133131)

```sh
NODE_ENV=production npx tsx scripts/inspect-postgres.ts
NODE_ENV=production npm run api:bootstrap -- --existing-schema \
  --name="Raj Kumar Goel Institute of Technology" --short-code=RKGIT --city=Ghaziabad \
  --lat=28.7009194 --lng=77.4425612 --zoom=16 --timezone=Asia/Kolkata
npm run smoke:production
```

## Release validation

After Render and Vercel have deployed, check `/healthz`, `/readyz` and `npm run smoke:production`. The smoke check validates the public campus list, RKGIT, and the production CORS origin. GitHub Actions runs it after successful production deployment events, hourly, and on manual dispatch. Sign in with an approved account for each role and verify a representative workflow. Record both deployment identifiers and physical-device GPS results.

## Rollback

Redeploy the previous verified Render and Vercel revisions together. The reviewed fallback is `4ed2817e305586227d68a0b436758de0f7c3816b`. Keep the existing PostgreSQL database and its records. This follow-up adds no schema changes. If the health-check setting causes an operational problem, restore its previous value on the same Render service. If rolling back recovery, advise users to sign in with their latest password and request a fresh code when recovery becomes available. Recheck `/healthz`, campus listing, preflight and approved role sign-ins. Follow the provider's recovery process only for a confirmed data incident. See [database rollback](DATABASE.md).
