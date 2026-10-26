# CampusBus Deployment Guide

Production is a split deploy: Vercel hosts the Vite React SPA, Render hosts the PostgreSQL-backed Express API (`server.ts`), and Neon (or another PostgreSQL provider) stores data.

| Layer | Provider | Notes |
|-------|----------|-------|
| Frontend | Vercel | Root Vite app; SPA rewrites in `vercel.json` |
| Backend API | Render | Blueprint service `campusbus-api` from `render.yaml` |
| Database | PostgreSQL (Neon) | Connection string in Render as `DATABASE_URL` |

Repo: `nitishdotdev/CampusBus`. Deploy the `main` branch after this work is merged.

Do not put unverified Render or Vercel hostnames in git. Copy the real URLs from each dashboard.

The MongoDB v1 path (`npm run api:dev` / `npm run api:build` / `npm run api:start`, `apps/api`) stays in the repo for local/experimental use. Production traffic must go to Render `server.ts` + PostgreSQL, not to `apps/api`. Do not set `VITE_USE_V1_API=true` in production.

---

## One-time setup checklist

### 1. PostgreSQL (Neon or equivalent)

1. Use the existing production Neon database. Do not migrate, reset, delete, or recreate it.
2. Confirm `DATABASE_URL` is the existing production connection string (SSL as required by the provider).
3. Schema changes are applied with `npm run db:migrate`, which runs `server/db/schema.sql` using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Existing rows are preserved.

### 2. Render (Backend API)

1. Create a **Web Service** connected to `nitishdotdev/CampusBus`.
2. Branch: `main`.
3. Render reads `render.yaml`:
   - Build: `npm ci && npm run build && npm run db:migrate`
   - Start: `npm run start`
   - Health check: `GET /api/health`
   - Plan: `starter` (do not raise the plan from this file)
4. Set these values in the Render dashboard (names only in git):

| Name | Purpose |
|------|---------|
| `DATABASE_URL` | Existing Neon / PostgreSQL connection string from step 1 |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `BOOTSTRAP_SECRET` | Temporary; `openssl rand -hex 16`. Needed only if no admin exists yet |
| `CORS_ORIGIN` | Exact Vercel origin, `https`, no trailing slash |

Leave `VITE_USE_V1_API` unset or `false`. Do not set `MONGODB_URI` on this service.

5. Deploy and wait until `/api/health` returns 200.
6. Copy the public service URL from the Render dashboard. That value is `$RENDER_API_URL` below. No trailing slash.

### 3. First admin (only if none exists)

If the Neon database already has an admin, skip this step.

```bash
# Create the first admin (requires BOOTSTRAP_SECRET). Uses the existing campus if one exists.
curl -X POST "$RENDER_API_URL/api/auth/bootstrap-admin" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: $BOOTSTRAP_SECRET" \
  -d '{
    "email": "<admin email>",
    "password": "<strong password>",
    "name": "<admin name>"
  }'
```

Then blank or delete `BOOTSTRAP_SECRET` in the Render dashboard so the bootstrap route stays closed.

### 4. Driver and additional admin accounts

There is no public driver/admin registration. After an admin is signed in, create DRIVER or ADMIN accounts from the admin directory, or:

```bash
curl -X POST "$RENDER_API_URL/api/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "email": "<driver email>",
    "password": "<strong password>",
    "name": "<driver name>",
    "role": "DRIVER"
  }'
```

Students self-register at `POST /api/auth/register` with `role: "STUDENT"` only.

### 5. Vercel (Frontend)

1. Import `nitishdotdev/CampusBus` on Vercel. Framework: Vite. Build: `npm run build`. Output: `dist`.
2. Set dashboard env vars (these are baked in at build time):

| Name | Value |
|------|--------|
| `VITE_API_URL` | `$RENDER_API_URL` from step 2.6, no trailing slash |
| `VITE_SOCKET_URL` | Same as `VITE_API_URL` |

Do not set `VITE_USE_V1_API=true`. Leave it unset or `false` so the SPA talks to the PostgreSQL API.

3. Set Render `CORS_ORIGIN` to the Vercel origin if you did not already.
4. Deploy, then redeploy the frontend after any API URL change.

---

## Smoke test after deploy

Replace `$RENDER_API_URL` with the Render URL from the dashboard.

```bash
# Health check
curl "$RENDER_API_URL/api/health"

# Campus list
curl "$RENDER_API_URL/api/colleges"

# Login
curl -X POST "$RENDER_API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin email>","password":"<password>"}'
```

Expect `/api/health` → JSON with a healthy database status, campus list JSON, and login JSON with `token` and `user`.

Open the Vercel site, pick a role, and confirm the campus selector loads from Render. If the API is unreachable, the form must show a connection error, not a hardcoded campus.

---

## Rollback

- Render: Manual Deploy → a previous successful deploy.
- Frontend: keep `VITE_USE_V1_API` unset/`false`. Enabling it points the SPA at the MongoDB v1 API, which is not production.
- `apps/api` + MongoDB remains in the repo and is unused by the production PostgreSQL path.

---

## Verified integrations (requires live services)

- [ ] PostgreSQL / Neon connectivity and non-destructive migrate
- [ ] Auth flow (student register → admin login → create driver → driver login)
- [ ] GPS update pipeline (driver → Socket.IO → student map)
- [ ] Render ↔ Vercel CORS (browser network tab, no calls to a Mongo v1 origin)
