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

Use the established Render service and existing database after [staging the migration](DATABASE.md). `/healthz` checks database connectivity and read access to the v1 campus table. It returns HTTP 503 when the probe fails. An empty campus table can still be healthy for infrastructure purposes, so separately check that `/api/v1/campuses` contains the intended campuses before releasing to users. Confirm the actual database and inventory before provisioning.

For password recovery, verify a sender domain with Resend, scope the API key to sending mail for that domain, and test delivery to an approved inbox. With no sender configured, sign-in explains that email recovery is unavailable and directs users to their campus administrator. The Render service uses in-process rate limits per account and IP. Before running multiple API instances, configure shared rate limits. Leave `EMAIL_VERIFICATION_REQUIRED` disabled until the separate registration verification flow is ready. Campus administrators can reset managed driver and student passwords.

## Vercel settings for the reviewed release

Set framework to Vite, use `npm run build`, and publish `dist` on the verified frontend project. Set the production `VITE_API_V1_URL` to `https://campusmove-nahp.onrender.com` without an API path. Use the approved staging API origin for Vercel Preview. The browser assets and router are published by Vercel. Keep the API bundle and email credentials on Render.

## Initial provisioning

The provisioning CLI can set up an empty database. Supply valid campus coordinates, an IANA time zone and a unique short code. Provide `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` through an ignored environment file or a secret-managed runner.

```sh
npm run api:bootstrap -- --name="Campus name" --short-code=ABC \
  --lat=28.46 --lng=77.03 --timezone=Asia/Kolkata
```

## Release validation

After approving and deploying both revisions, confirm the public API and browser CORS contract, sign in with an approved account for each role and verify a representative workflow. Record the rendered Vercel and Render deployment identifiers. Do not infer production readiness from a successful local build.

## Rollback

Redeploy the previous verified Render and Vercel revisions together. The reviewed fallback is `4ed2817e305586227d68a0b436758de0f7c3816b`. Keep the existing PostgreSQL database and its records. This follow-up adds no schema changes. If the health-check setting causes an operational problem, restore its previous value on the same Render service. If rolling back recovery, advise users to sign in with their latest password and request a fresh code when recovery becomes available. Recheck `/healthz`, campus listing, preflight and approved role sign-ins. Follow the provider's recovery process only for a confirmed data incident. See [database rollback](DATABASE.md).
