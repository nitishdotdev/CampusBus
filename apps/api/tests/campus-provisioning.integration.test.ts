import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import pg from 'pg';
import { provisionCampus } from '../src/bootstrap/provisionCampus';
import { createApp } from '../src/http/app';
import { newId } from '../src/infra/postgres/ids';
import { applyV1Schema, campusProvisioningReadiness, databaseReadiness } from '../src/infra/postgres/pool';
import { createPostgresRepositories } from '../src/infra/postgres/repositories';
import { PG_TEST_URL } from './harness';

// Exercises the real Postgres campus repository and the public campus, liveness and
// readiness routes against an empty database and against a provisioned one.

const RKGIT = {
  name: 'Raj Kumar Goel Institute of Technology',
  shortCode: 'RKGIT',
  city: 'Ghaziabad',
  lat: 28.7009194,
  lng: 77.4425612,
  zoom: 16,
  timezone: 'Asia/Kolkata',
};

const ASU = {
  name: 'Apex State University',
  shortCode: 'ASU',
  city: 'Los Angeles',
  lat: 34.0537,
  lng: -118.257,
  zoom: 15,
  timezone: 'America/Los_Angeles',
};

describe.skipIf(!PG_TEST_URL)('campus provisioning against PostgreSQL', () => {
  let control: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let server: http.Server;
  let base: string;
  let repos: ReturnType<typeof createPostgresRepositories>;

  beforeAll(async () => {
    const url = new URL(PG_TEST_URL!);
    dbName = `campusbus_test_${newId()}`;
    control = new pg.Pool({ connectionString: url.href, max: 1 });
    await control.query(`CREATE DATABASE "${dbName}"`);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.href });
    await applyV1Schema(pool);
    repos = createPostgresRepositories(pool);

    const app = createApp({
      ingest: {} as any, trips: {} as any, live: {} as any, auth: {} as any,
      users: {} as any, buses: {} as any, routes: {} as any, tripRepo: {} as any,
      campuses: repos.campuses,
      verifyToken: () => null,
      isSessionActive: async () => true,
      allowedOrigins: ['https://campus-bus-delta.vercel.app'],
      checkReadiness: databaseReadiness(pool),
      checkCampusProvisioning: campusProvisioningReadiness(pool),
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    await control.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await control.end();
  });

  it('empty campus table: public list is a 200 empty array, liveness passes, readiness reports NO_CAMPUS_PROVISIONED', async () => {
    const list = await fetch(`${base}/api/v1/campuses`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);

    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: 'not_ready', reason: 'NO_CAMPUS_PROVISIONED' });
  });

  it('provisioning RKGIT makes it the public list entry and turns readiness green', async () => {
    const first = await provisionCampus(repos.campuses, RKGIT);
    expect(first.created).toBe(true);

    const list = await fetch(`${base}/api/v1/campuses`);
    expect(list.status).toBe(200);
    const body = await list.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: first.campus.id,
      name: RKGIT.name,
      shortCode: 'RKGIT',
      city: 'Ghaziabad',
      lat: RKGIT.lat,
      lng: RKGIT.lng,
      zoom: 16,
      timezone: 'Asia/Kolkata',
    });

    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', campuses: 'provisioned' });
  });

  it('re-running provisioning is idempotent and keeps the original record', async () => {
    const again = await provisionCampus(repos.campuses, { ...RKGIT, name: 'Renamed Should Not Apply' });
    expect(again.created).toBe(false);
    const list = await repos.campuses.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe(RKGIT.name);
  });

  it('multi-campus: adding another campus keeps RKGIT and both are served', async () => {
    const asu = await provisionCampus(repos.campuses, ASU);
    expect(asu.created).toBe(true);
    const list = await repos.campuses.list();
    expect(list.map((c) => c.shortCode).sort()).toEqual(['ASU', 'RKGIT']);
  });

  it('concurrent bootstrap attempts return the same new campus', async () => {
    const campus = { ...ASU, shortCode: 'CONCURRENT' };
    const results = await Promise.all([
      provisionCampus(repos.campuses, campus),
      provisionCampus(repos.campuses, { ...campus, shortCode: 'concurrent' }),
    ]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(results[0].campus.id).toBe(results[1].campus.id);
  });
});
