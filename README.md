# CampusBus — Smart Campus Bus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8.3-purple.svg)](https://vitejs.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791.svg)](https://www.postgresql.org)

CampusBus is a production-grade multi-tenant smart campus transit and live bus tracking platform designed for university fleets, students, campus drivers, and transportation administrators.

---

## 🚀 Key Capabilities

* **Multi-Tenant Campus Architecture**: Institutional boundary isolation supporting independent universities, fleet registries, routes, and user directories.
* **Live GPS Tracking & Telemetry**: High-frequency bus coordinate updates broadcast via authenticated Socket.IO channels with automatic fallback.
* **IndexedDB Offline Telemetry Queue**: Drivers maintain a persistent browser IndexedDB queue (`telemetry_queue`) during cellular dead zones, automatically re-syncing in batches once connectivity resumes.
* **Role-Based Access Control (RBAC)**: Strict separation of privileges across `STUDENT`, `DRIVER`, and `ADMIN` personas with JWT authentication.
* **Dynamic ETA Confidence Engine**: Real-time arrival confidence scoring (`LIVE`, `HIGH`, `MEDIUM`, `LOW`, `OFFLINE`) based on coordinate staleness and vehicle speed.
* **Emergency Dispatch & Broadcasts**: Driver-triggered silent emergency SOS alarms with real-time administrative acknowledgement and campus-wide notifications.
* **Dual Database Pipeline**: Pure PostgreSQL in production with non-destructive migrations (`server/db/schema.sql`) and an embedded fallback engine for zero-config local development.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
* **Node.js**: v18.0.0 or later (v20+ recommended)
* **npm**: v9.0.0 or later

### 2. Installation
```bash
git clone https://github.com/NitishSolves/CampusMove.git
cd CampusMove
npm install
```

### 3. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```
For local development, default embedded persistence is enabled automatically if `DATABASE_URL` is omitted.

### 4. Running Development Server
```bash
npm run dev
```
The dev server starts unified on `http://localhost:3000` (serving both the Express API and Vite React frontend with live hot reload).

---

## 🧪 Automated Testing & Verification

Run the comprehensive 48-point integration and regression test suite:
```bash
npm run test:verify
```

Run the production-hardening assurance test suite (verifying PostgreSQL enforcement, production JWT rules, and fallback disabling):
```bash
npx tsx scripts/test-prod-hardening.ts
```

Run static type checking and linter:
```bash
npm run lint
```

---

## Production Deployment Architecture

Production v1 is a split deploy. Details, env names, and smoke tests are in `docs/DEPLOYMENT.md`.

* Frontend: Vercel (Vite SPA; `vercel.json`)
* Backend: Render web service `campusmove-api` (`apps/api`, health check `/healthz`)
* Database: MongoDB Atlas (`MONGODB_URI`)

Do not bake unverified Render or Vercel hostnames into git. Set `VITE_API_V1_URL` in the Vercel dashboard and `CORS_ORIGIN` in the Render dashboard.

The legacy Express + PostgreSQL path (`server.ts`, `DATABASE_URL`, `/api/health`) remains in the repo for local/dev use. Production v1 traffic must go to Render `apps/api`, not to the Vercel origin.

---

## Security & Safe Migrations

* Legacy PostgreSQL migrations (`npm run db:migrate`) use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
* Production v1 (`apps/api`) requires `MONGODB_URI`, `ACCESS_TOKEN_SECRET`, and `REFRESH_TOKEN_SECRET` at process start. `SIMULATION_MODE=on` is fatal in production. CORS wildcards, localhost, and non-HTTPS origins are rejected.
* The legacy `server.ts` path refuses to start in production without `DATABASE_URL` and `JWT_SECRET` (no silent file-store fallback).

---

## 📄 License

This project is licensed under the MIT License.


---

## Development Status

This project is being rebuilt as a production-ready MERN application on the `feature/mern-rebuild` branch.

**See these files for the current state:**
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — canonical progress record
- [`docs/ACCEPTANCE_CHECKLIST.md`](docs/ACCEPTANCE_CHECKLIST.md) — 67-item completion checklist
- [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — exact stopping point and next tasks
- [`docs/CONTINUATION_PROMPT.md`](docs/CONTINUATION_PROMPT.md) — prompt to continue in a new AI session
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and migration strategy
- [`docs/SECURITY.md`](docs/SECURITY.md) — security controls and known gaps
- [`docs/GPS_TRACKING.md`](docs/GPS_TRACKING.md) — GPS pipeline and authorization rules
- [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) — PostgreSQL → MongoDB plan

### Quick start (dev, feature branch)

```bash
git checkout feature/mern-rebuild
npm ci
npm run dev          # legacy server + Vite frontend on :3000
```

### Running tests

```bash
npm run lint         # TypeScript checks (app + strict apps/api)
npm test             # Vitest unit suite (no services needed)
npm run build        # production build

# With a disposable MongoDB (never production):
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test

# Legacy HTTP integration suite (needs dev server running):
npm run test:verify
```

### Environment variables

See [`.env.example`](.env.example) for all required variables.
