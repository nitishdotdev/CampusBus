# CampusBus

CampusBus serves scheduled departures, assigned-vehicle GPS tracking, driver trip operations, and campus dispatch. The React frontend uses the Express and Socket.IO API in `apps/api`. PostgreSQL is the application store.

## Local development

Use Node.js 22.12+ or 24 and a disposable PostgreSQL 16 instance. For example, Docker can start a local database bound to loopback.

```sh
docker run --name campusbus-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=campusbus_dev -p 127.0.0.1:5432:5432 -d postgres:16
npm ci
cp .env.example .env
```

Set `DATABASE_URL` for your development database. Generate two different token secrets with `openssl rand -hex 32` and put them in the ignored `.env` file. Set the campus and initial admin with `npm run api:bootstrap` if the database is empty. The [deployment guide](docs/DEPLOYMENT.md) describes the required flags and credential handling.

```sh
npm run api:dev  # Express + Socket.IO, port 4000
npm run dev      # Vite, port 5173, proxies API and sockets
```

The API applies the additive schema on startup. `npm run db:migrate` also applies it without launching HTTP. A normal local Vite session uses the development proxy. Set `VITE_API_V1_URL` to an explicit origin when building the frontend.

```sh
npm run lint
npm test
VITE_API_V1_URL=http://localhost:4000 npm run build
npm run api:build
```

The full test suite requires PostgreSQL and a separate PostgreSQL service for TLS checks. See [testing](docs/TESTING.md), [architecture](docs/ARCHITECTURE.md), [database and rollback](docs/DATABASE.md), and the [acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md).

## License

MIT.
