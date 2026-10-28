# CampusBus Deployment Guide

Production is a split deploy: Vercel hosts the Vite React SPA, Render hosts the standalone Node API in `apps/api`, and MongoDB Atlas stores data.

| Layer | Provider | Notes |
|-------|----------|-------|
| Frontend | Vercel | Root Vite app; SPA rewrites in `vercel.json` |
| Backend API | Render | Blueprint service `campusbus-api` from `render.yaml` |
| Database | MongoDB Atlas | Connection string in Render as `MONGODB_URI` |

Repo: `nitishdotdev/CampusBus`. Deploy the `main` branch after this work is merged.

Do not put unverified Render or Vercel hostnames in git. Copy the real URLs from each dashboard.

The legacy Express + PostgreSQL path (`npm run dev` / `npm run build` / `npm start`, `server.ts`) stays in the repo. Production v1 traffic must go to Render `apps/api`, not to the Vercel origin.

---

## One-time setup checklist

### 1. MongoDB Atlas

1. Create a cluster.
2. Create a database user with `readWrite` on the database you will use (for example `campusbus`).
3. Allowlist Render outbound IPs, or `0.0.0.0/0` only if you accept that risk while testing.
4. Copy the SRV connection string. Keep the database name in the path. Example shape only:

```text
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

### 2. Render (Backend API)

1. Create a **Web Service** connected to `nitishdotdev/CampusBus`.
2. Branch: `main`.
3. Render reads `render.yaml`:
   - Build: `npm ci && npm run api:build`
   - Start: `npm run api:start`
   - Health check: `GET /healthz`
   - Plan: `starter` (do not raise the plan from this file)
4. Set these values in the Render dashboard (names only in git):

| Name | Purpose |
|------|---------|
| `MONGODB_URI` | Atlas connection string from step 1 |
| `ACCESS_TOKEN_SECRET` | `openssl rand -hex 32` |
| `REFRESH_TOKEN_SECRET` | `openssl rand -hex 32` (must differ from access) |
| `BOOTSTRAP_SECRET` | Temporary; `openssl rand -hex 16` |
| `CORS_ORIGIN` | Exact Vercel origin, `https`, no trailing slash |

`SIMULATION_MODE=on` is fatal when `NODE_ENV=production`. Leave it unset or `off`.

5. Deploy and wait until `/healthz` returns 200.
6. Copy the public service URL from the Render dashboard. That value is `$RENDER_API_URL` below. No trailing slash.

### 3. Bootstrap the first campus

Run once against the live Render URL. Replace `$RENDER_API_URL`, `$BOOTSTRAP_SECRET`, and the JSON fields with your campus. Do not reuse sample institutions from old docs.

```bash
# Create the first campus (requires BOOTSTRAP_SECRET)
curl -X POST "$RENDER_API_URL/api/v1/campuses" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: $BOOTSTRAP_SECRET" \
  -d '{
    "name": "<campus name>",
    "shortCode": "<short code>",
    "city": "<city>",
    "lat": 0,
    "lng": 0,
    "zoom": 15,
    "timezone": "<IANA timezone>"
  }'
```

Copy `id` from the response. That is `campusId`.

Then blank or delete `BOOTSTRAP_SECRET` in the Render dashboard so the bootstrap route stays closed.

### 4. First admin user

There is no public admin-creation UI. Register a user, then promote that document in Atlas.

```bash
# Self-register is STUDENT-only
curl -X POST "$RENDER_API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "campusId": "<campusId from step 3>",
    "email": "<admin email>",
    "password": "<strong password>",
    "name": "<admin name>",
    "role": "STUDENT"
  }'
```

In Atlas → Browse Collections → `users` for that campus:

- Set `role` to `ADMIN`
- Set `status` to `ACTIVE`

### 5. Vercel (Frontend)

1. Import `nitishdotdev/CampusBus` on Vercel. Framework: Vite. Build: `npm run build`. Output: `dist`.
2. Set dashboard env vars (these are baked in at build time):

| Name | Value |
|------|--------|
| `VITE_USE_V1_API` | `true` (`vercel.json` already sets this) |
| `VITE_API_V1_URL` | `$RENDER_API_URL` from step 2.6, no trailing slash |

A production v1 build fails if `VITE_API_V1_URL` is missing or not an absolute `http(s)` URL. That is intentional: the SPA must not send `/api/v1/*` to the Vercel origin.

3. Set Render `CORS_ORIGIN` to the Vercel origin if you did not already.
4. Deploy, then redeploy the frontend after any API URL change.

---

## Smoke test after deploy

Replace `$RENDER_API_URL` with the Render URL from the dashboard.

```bash
# Health check
curl "$RENDER_API_URL/healthz"

# Campus list (empty array until step 3 succeeds)
curl "$RENDER_API_URL/api/v1/campuses"

# Login
curl -X POST "$RENDER_API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"campusId":"<campusId>","email":"<admin email>","password":"<password>"}'
```

Expect `/healthz` → `{"status":"ok"}`, campus list JSON, and login JSON with `tokens` and `user`.

Open the Vercel site, pick a role, and confirm the campus selector loads from Render. If the API is unreachable, the form must show a connection error, not "No campuses found".

---

## Rollback

- Render: Manual Deploy → a previous successful deploy.
- Frontend: set `VITE_USE_V1_API=false` in Vercel and redeploy only if you intentionally fall back to the legacy path. That path still needs its own backend; it will not talk to `apps/api`.
- Legacy `server.ts` + PostgreSQL remains in the repo and is unused by the production v1 path.

---

## Verified integrations (requires live services)

- [ ] MongoDB Atlas connectivity and index creation
- [ ] Auth flow (register → promote admin → login → refresh)
- [ ] GPS update pipeline (driver → Socket.IO → student map)
- [ ] Email delivery (SMTP), if configured
- [ ] Render ↔ Vercel CORS (browser network tab, no calls to the Vercel origin for `/api/v1`)
