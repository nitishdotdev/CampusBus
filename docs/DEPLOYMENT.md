# CampusBus Deployment Guide

## Stack
| Layer | Provider | Notes |
|-------|----------|-------|
| Frontend | Vercel | Vite SPA. Production must set `VITE_USE_V1_API=true` and `VITE_API_V1_URL`. |
| Backend API | Render | `apps/api/src/server.ts` compiled by `npm run api:build`. |
| Database | Neon PostgreSQL | Required `DATABASE_URL`. MongoDB is not used by the running V1 API. |

Do not guess hostnames. Use the actual Vercel production origin for `CORS_ORIGIN` and the actual Render origin for `VITE_API_V1_URL`.

---

## One-time setup checklist

### 1. Neon PostgreSQL
1. Create a Neon project and database.
2. Copy the pooled or direct connection string into Render as `DATABASE_URL`.
3. The API applies `apps/api/src/infra/postgres/schema.sql` on startup.
4. Optional: set `DATABASE_SSL_MODE=verify` on Render if you pin a CA.

### 2. Render (Backend API)
1. Create a **Web Service** connected to this repository.
2. Render reads `render.yaml` for build/start commands (`npm ci && npm run api:build`, `npm run api:start`).
3. Set these secret env vars in the Render dashboard:
   - `DATABASE_URL` — Neon connection string
   - `ACCESS_TOKEN_SECRET` — `openssl rand -hex 32`
   - `REFRESH_TOKEN_SECRET` — `openssl rand -hex 32` (must differ)
   - `BOOTSTRAP_SECRET` — `openssl rand -hex 16` (temporary, campus + first admin)
   - `CORS_ORIGIN` — the actual Vercel frontend origin, e.g. `https://campus-move-one.vercel.app`
4. Deploy. Confirm `/healthz` returns `{"status":"ok"}`.
5. Confirm `GET /api/v1/campuses` returns JSON (an empty array is valid before bootstrap).

### 3. Bootstrap the first campus
Preferred: trusted one-time CLI against the same `DATABASE_URL` (idempotent on short code). Do not commit the secret.

```bash
DATABASE_URL='postgresql://...' npm run api:bootstrap -- \
  --name="Apex State University" \
  --short-code=ASU \
  --city="Los Angeles" \
  --lat=34.0537 \
  --lng=-118.2570 \
  --timezone=America/Los_Angeles \
  --admin-email=admin@yourcampus.edu \
  --admin-password='<unique-admin-password>' \
  --admin-name="Campus Admin"
```

HTTP alternative after the Render service is live:

```bash
curl -X POST "$RENDER_API_ORIGIN/api/v1/campuses" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: $BOOTSTRAP_SECRET" \
  -d '{
    "name": "Apex State University",
    "shortCode": "ASU",
    "city": "Los Angeles",
    "lat": 34.0537,
    "lng": -118.2570,
    "zoom": 15,
    "timezone": "America/Los_Angeles"
  }'
```

POST `/api/v1/campuses` is not public. It requires `x-bootstrap-secret` matching `BOOTSTRAP_SECRET`. Copy the `id` from the response. Signup cannot succeed until at least one campus exists. GET `/api/v1/campuses` is public and returns `[]` only when no campuses exist.

### 4. Provision the first administrator
Do not register an admin through the public signup form. Use the CLI above, the one-time bootstrap route, then remove `BOOTSTRAP_SECRET`.

```bash
curl -X POST "$RENDER_API_ORIGIN/api/v1/auth/bootstrap-admin" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: $BOOTSTRAP_SECRET" \
  -d '{
    "campusId": "<id from step 3>",
    "email": "admin@yourcampus.edu",
    "password": "<unique-admin-password>",
    "name": "Campus Admin"
  }'
```

Alternatively, from a trusted host with `DATABASE_URL` set:

```bash
ADMIN_PASSWORD='<unique-admin-password>' npm run bootstrap:admin -- \
  --campus-id '<id from step 3>' \
  --email 'admin@yourcampus.edu' \
  --name 'Campus Admin'
```

Then blank or delete `BOOTSTRAP_SECRET` in Render. The route refuses a second administrator.

### 5. Working accounts by role
- **Student**: public V1 registration (`POST /api/v1/auth/register`, role `STUDENT`) then `POST /api/v1/auth/login`.
- **Driver**: created by an administrator via `POST /api/v1/users/drivers`. Public driver signup stays `PENDING` until approved.
- **Administrator**: bootstrap only. Sign in through the same V1 login API and land on `/admin`.

Do not seed shared demo credentials. Legacy sample accounts are not V1 accounts.

### 6. Vercel (Frontend)
1. Import the repository into Vercel.
2. Set env vars in the Vercel dashboard (not only `vercel.json`):
   - `VITE_USE_V1_API` = `true` (also present in `vercel.json`)
   - `VITE_API_V1_URL` = Render origin with **no** `/api/v1` suffix
3. Production builds fail if `VITE_API_V1_URL` is missing or invalid.
4. `vercel.json` already configures SPA rewrites and security headers.

---

## Smoke test after deploy

```bash
curl "$RENDER_API_ORIGIN/healthz"
curl "$RENDER_API_ORIGIN/api/v1/campuses"
```

Login from the Vercel app using the campus selector. A missing campus directory, empty campus list, and connectivity/CORS failure show distinct messages.

---

## Windows 7 / Chrome 109

The production frontend is built for `chrome109` with Tailwind CSS 3.4.x. Windows 7 is an unsupported, insecure operating system. Upgrade the OS and browser for production account usage whenever possible.

Remaining Chrome 109 limits:
- Modern CSS such as `dvh` is avoided on auth pages; layout uses `min-h-screen`.
- Leaflet maps and Socket.IO remain usable if the browser can load the production bundle.
- Google Fonts and unpkg Leaflet CSS require network access.

---

## Rollback
- Render: Manual Deploy of a previous build.
- Frontend: keep `VITE_USE_V1_API=true`. Do not silently fall back to `/api/auth/*` in production.
