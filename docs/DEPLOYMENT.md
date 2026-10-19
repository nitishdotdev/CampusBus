# CampusMove Deployment Guide

## Stack
| Layer | Provider | URL |
|-------|----------|-----|
| Frontend | Vercel | https://campus-move-one.vercel.app |
| Backend API | Render | https://campusmove-api.onrender.com (after deploy) |
| Database | MongoDB Atlas | Cluster in your Atlas project |

---

## One-time setup checklist

### 1. MongoDB Atlas
1. Create a free M0 (or paid) cluster.
2. Create a database user with `readWrite` on the `campusmove` database.
3. Allowlist IPs: add Render's outbound IPs **or** `0.0.0.0/0` for testing.
4. Copy the connection string: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/campusmove?retryWrites=true&w=majority`

### 2. Render (Backend API)
1. Create a new **Web Service** → connect the `nitishdotdev/CampusMove` repo.
2. Use branch: `feature/frontend-v1-integration` (or `main` after merge).
3. Render auto-reads `render.yaml` for build/start commands.
4. Set these secret env vars in the Render dashboard:
   - `MONGODB_URI` → Atlas connection string from step 1
   - `ACCESS_TOKEN_SECRET` → `openssl rand -hex 32`
   - `REFRESH_TOKEN_SECRET` → `openssl rand -hex 32` (must differ)
   - `BOOTSTRAP_SECRET` → `openssl rand -hex 16` (temporary)
   - `CORS_ORIGIN` → `https://campus-move-one.vercel.app`
5. Deploy. Wait for health check to pass at `/healthz`.
6. Note the Render service URL (e.g. `https://campusmove-api.onrender.com`).

### 3. Bootstrap the first campus
Run once after the Render service is live:
```bash
curl -X POST https://campusmove-api.onrender.com/api/v1/campuses \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: YOUR_BOOTSTRAP_SECRET" \
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
Copy the `id` from the response — this is your `campusId` for the first admin registration.

After this, clear or blank `BOOTSTRAP_SECRET` in the Render dashboard.

### 4. Register the first admin
There is no admin-creation UI yet. Register via curl and then manually promote in Atlas:
```bash
# Register as STUDENT (any role works for initial bootstrap)
curl -X POST https://campusmove-api.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "campusId": "<id from step 3>",
    "email": "admin@yourcampus.edu",
    "password": "ChangeMe123!",
    "name": "Campus Admin",
    "role": "STUDENT"
  }'
```
Then in Atlas → Browse Collections → `users`:
- Set `role: "ADMIN"`
- Set `status: "ACTIVE"`

### 5. Vercel (Frontend)
1. Connect the same GitHub repo to Vercel.
2. Set env var in Vercel dashboard:
   - `VITE_API_V1_URL` → `https://campusmove-api.onrender.com`
   - `VITE_USE_V1_API` → `true` (already set in `vercel.json` env block)
3. Deploy. `vercel.json` already configures SPA rewrites and security headers.

---

## Smoke test after deploy

```bash
# 1. Health check
curl https://campusmove-api.onrender.com/healthz
# Expected: {"status":"ok"}

# 2. Campus list (should return your campus)
curl https://campusmove-api.onrender.com/api/v1/campuses
# Expected: [{...}]

# 3. Login
curl -X POST https://campusmove-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"campusId":"<id>","email":"admin@yourcampus.edu","password":"ChangeMe123!"}'
# Expected: { tokens: {...}, user: {...}, refreshToken: "..." }
```

---

## Rollback
- Render: click **Manual Deploy** → select a previous deploy.
- The legacy backend (`server.ts` + PostgreSQL) remains on `main` and is unaffected by this branch.
- To revert the frontend: set `VITE_USE_V1_API=false` in Vercel and redeploy.

---

## Verified integrations (requires live services)
- [ ] MongoDB Atlas connectivity and index creation
- [ ] Auth flow end-to-end (register → login → refresh)
- [ ] GPS update pipeline (driver → Socket.IO → student map)
- [ ] Email delivery (SMTP configuration)
- [ ] Render ↔ Vercel CORS (check browser network tab)
