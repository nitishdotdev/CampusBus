import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, PG_TEST_URL, type Harness } from './harness';

describe.skipIf(!PG_TEST_URL)('emergency alert visibility by role', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const tok = (userId: string, role: 'DRIVER' | 'ADMIN') => h.token({ id: userId, campusId: h.seed.campusA, role });
  const get = (path: string, t: string) => request(h.app).get(path).set('Authorization', `Bearer ${t}`);
  const post = (path: string, body: object, t: string) => request(h.app).post(path).set('Authorization', `Bearer ${t}`).send(body);

  it('a driver lists only the alerts they raised, not other drivers\' alerts in the same campus', async () => {
    const driverOne = tok(h.seed.driver1, 'DRIVER');
    const driverTwo = tok(h.seed.driver2, 'DRIVER');

    const first = await post('/api/v1/alerts', { busId: h.seed.bus1, message: 'Driver one alert' }, driverOne);
    expect(first.status).toBe(201);
    const second = await post('/api/v1/alerts', { busId: h.seed.bus2, message: 'Driver two alert' }, driverTwo);
    expect(second.status).toBe(201);

    const seenByTwo = await get('/api/v1/alerts', driverTwo);
    expect(seenByTwo.status).toBe(200);
    const idsSeenByTwo = seenByTwo.body.items.map((alert: { id: string }) => alert.id);
    expect(idsSeenByTwo).toContain(second.body.id);
    expect(idsSeenByTwo).not.toContain(first.body.id);
    expect(seenByTwo.body.items.every((alert: { raisedBy: string }) => alert.raisedBy === h.seed.driver2)).toBe(true);
  });

  it('the driver scope cannot be widened with a query parameter', async () => {
    const driverTwo = tok(h.seed.driver2, 'DRIVER');
    const r = await get(`/api/v1/alerts?raisedBy=${h.seed.driver1}`, driverTwo);
    expect(r.status).toBe(200);
    expect(r.body.items.every((alert: { raisedBy: string }) => alert.raisedBy === h.seed.driver2)).toBe(true);
  });

  it('an administrator still lists alerts from every driver in the campus', async () => {
    const admin = tok(h.seed.adminA, 'ADMIN');
    const r = await get('/api/v1/alerts', admin);
    expect(r.status).toBe(200);
    const raisers = new Set(r.body.items.map((alert: { raisedBy: string }) => alert.raisedBy));
    expect(raisers.has(h.seed.driver1)).toBe(true);
    expect(raisers.has(h.seed.driver2)).toBe(true);
  });
  it('deduplicates concurrent attempts and reads the exact alert within its scope', async () => {
    const driver = tok(h.seed.driver1, 'DRIVER');
    const requestId = 'e'.repeat(24);
    const body = { requestId, busId: h.seed.bus1, message: 'Idempotent alert' };
    const deliveries = await Promise.all([post('/api/v1/alerts', body, driver), post('/api/v1/alerts', body, driver)]);
    expect(deliveries.every(res => [200, 201].includes(res.status) && res.body.id === requestId)).toBe(true);
    expect((await h.pool.query('SELECT count(*)::int AS count FROM v1.emergency_alerts WHERE id = $1', [requestId])).rows[0].count).toBe(1);
    expect((await get(`/api/v1/alerts/${requestId}`, driver)).status).toBe(200);
    expect((await get(`/api/v1/alerts/${requestId}`, tok(h.seed.driver2, 'DRIVER'))).status).toBe(404);
    const otherCampus = h.token({ id: h.seed.adminB, campusId: h.seed.campusB, role: 'ADMIN' });
    expect((await get(`/api/v1/alerts/${requestId}`, otherCampus)).status).toBe(404);
    const admin = tok(h.seed.adminA, 'ADMIN');
    expect((await post(`/api/v1/alerts/${requestId}/acknowledge`, {}, admin)).body.status).toBe('ACKNOWLEDGED');
    expect((await post('/api/v1/alerts', body, driver)).body.status).toBe('ACKNOWLEDGED');
    expect((await post(`/api/v1/alerts/${requestId}/resolve`, {}, admin)).body.status).toBe('RESOLVED');
  });

});
