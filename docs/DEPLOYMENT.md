# Deployment

## Observed and declared configuration

The repository's `render.yaml` declares an Express web service named `campusmove-api`. Public health and campus directory requests responded at `https://campusmove-nahp.onrender.com`. The unsuffixed Render hostname returned a Render routing 404. `https://campus-move-one.vercel.app` returned `DEPLOYMENT_NOT_FOUND`. The alternate `campusmove.vercel.app` served an older Supabase frontend. The GitHub preview integration points at the Vercel project `campus-bus`. Its public domain `campus-bus.vercel.app` served a Flutter build, and the pull request preview failed. The actual Render service settings, database inventory, and intended Vercel project configuration require dashboard confirmation.

## Render settings for the reviewed release

| Field | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `npm ci && npm run api:build` |
| Start command | `npm run api:start` |
| Health check | `/healthz` |
| Runtime | Node.js 22.12+ or 24 and `NODE_ENV=production` |
| `DATABASE_URL` | Existing confirmed Neon PostgreSQL connection, set through managed secrets |
| `DATABASE_SSL_MODE` | `verify`. Supply a private CA only when required by the confirmed host. |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | Distinct existing secrets, at least 32 characters. Rotating them requires reauthentication. |
| `CORS_ORIGIN` | Exact verified Vercel HTTPS origin. List approved preview or custom origins explicitly if required. |
| `BOOTSTRAP_SECRET` | Leave unset unless explicitly authorizing initial HTTP provisioning. |
| `SIMULATION_MODE` | Leave unset or set `off`. |

Use the established Render service and existing database after [staging the migration](DATABASE.md). Do not create a second production database to work around configuration drift. The repository only includes an email delivery placeholder. Leave email verification disabled until a real delivery adapter and the user-facing verification workflow are ready. Campus administrators can reset managed driver and student passwords.

## Vercel settings for the reviewed release

Set framework to Vite, use `npm run build`, and publish `dist` on the verified frontend project. Set `VITE_API_V1_URL` to `https://campusmove-nahp.onrender.com` if the dashboard confirms that service is the intended backend. Use the exact public origin without an API path. Remove obsolete `VITE_USE_V1_API`, `VITE_API_URL`, and `VITE_SOCKET_URL` values. Only public values belong in Vite variables. The browser assets and router are published by Vercel. The API bundle stays in Render.

## Initial provisioning

The provisioning CLI can set up an empty database. Supply valid campus coordinates, an IANA time zone and a unique short code. Provide `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` through an ignored environment file or a secret-managed runner.

```sh
npm run api:bootstrap -- --name="Campus name" --short-code=ABC \
  --lat=28.46 --lng=77.03 --timezone=Asia/Kolkata
```

## Release validation

After approving and deploying both revisions, confirm the public API and browser CORS contract, sign in with an approved account for each role and verify a representative workflow. Record the rendered Vercel and Render deployment identifiers. Do not infer production readiness from a successful local build.
