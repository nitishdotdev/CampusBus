# Production campus bootstrap runbook

CampusBus serves login campuses from `v1.campuses`. A new or restored database has no campus until bootstrap runs, and the login screen then shows "No campuses found". This runbook provisions a campus idempotently and verifies it. It never resets the database or deletes records.

## Endpoints

| Path | Meaning | Healthy response |
| --- | --- | --- |
| `/healthz` | Liveness: process up and database reachable. Used by the Render health check. Does not depend on campus data. | `200 {"status":"ok"}` |
| `/readyz` | Operational readiness: liveness plus at least one provisioned campus. | `200 {"status":"ready","campuses":"provisioned"}` |
| `/api/v1/campuses` | Public campus list used by the login screens. | `200` JSON array of campus records |

`/readyz` returns `503 {"status":"not_ready","reason":"NO_CAMPUS_PROVISIONED"}` when bootstrap has not run against the database the API is using. It returns `503 {"status":"unavailable"}` when the database cannot be read.

## 1. Confirm the target database

Before any write, confirm that the Render service `campusmove-api` uses the intended production database:

1. In Render, open the service's Environment settings and confirm `DATABASE_URL` points at the production database. Do not copy the value into logs or chat.
2. Confirm the Neon project, branch and database against that binding. Run the read-only inventory with the trusted connection and TLS settings from the secret store:

   ```sh
   NODE_ENV=production npx tsx scripts/inspect-postgres.ts
   ```

3. Review `v1`, `public`, and any other application schemas for existing records, legacy tables, and migration metadata. The inventory reports visible table names, counts, and columns without reading individual records into logs. CampusBus applies idempotent v1 SQL and has no separate v1 migration history table.

## 2. Provision a campus (idempotent)

The CLI keys on `--short-code`. If a campus with that code already exists, it reports `already exists` and changes nothing.

```sh
NODE_ENV=production npm run api:bootstrap -- --existing-schema \
  --name="Raj Kumar Goel Institute of Technology" \
  --short-code=RKGIT \
  --city="Ghaziabad" \
  --lat=28.7009194 --lng=77.4425612 \
  --zoom=16 \
  --timezone=Asia/Kolkata
```

The published point is inside the mapped campus outline in Ghaziabad, Uttar Pradesh, India. Zoom 16 shows the campus. `--existing-schema` leaves schema application to the existing deployment workflow. Add a first administrator from a single trusted operator session using the secret-managed variables `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and `BOOTSTRAP_ADMIN_PASSWORD`. The administrator step is skipped when the campus already has an administrator. [Institute contact and map](https://rkgit.edu.in/contactus) · [OpenStreetMap campus outline](https://www.openstreetmap.org/way/1409133131)

Do not set `BOOTSTRAP_SECRET` on Render. It enables the HTTP bootstrap route and is not needed for the CLI.

## 3. Verify

```sh
node scripts/smoke-campuses.mjs \
  --api https://campusmove-nahp.onrender.com \
  --origin https://campus-bus-delta.vercel.app \
  --expect-short-code RKGIT
```

The script checks `/healthz`, `/readyz`, the campus list shape, the CORS headers for the frontend origin, and that the expected short code is listed. The **Production campus smoke test** workflow runs after successful production deployment events, hourly, and on manual dispatch.

Then sign in once per role with an approved account (student, driver, admin) and confirm the campus appears on the login screen.

## Multi-campus

Each campus has its own short code. Provisioning a second campus later does not change existing campuses. Users are tied to their campus, and every login sends the selected campus id.

## Troubleshooting

- `/readyz` returns `NO_CAMPUS_PROVISIONED`: the database has no campus rows. Run step 2 against that database.
- `/readyz` returns `unavailable` while `/healthz` is `ok`: the campus query failed or timed out. Check database load and locks, not the campus data.
- `/api/v1/campuses` returns `[]`: same cause as `NO_CAMPUS_PROVISIONED`.
- CORS failures in the browser: confirm `CORS_ORIGIN` on Render is exactly `https://campus-bus-delta.vercel.app` (no trailing slash).
