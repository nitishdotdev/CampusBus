import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, PG_TEST_URL, type Harness } from './harness';

describe.skipIf(!PG_TEST_URL)('Campus complaints', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h?.close(); });
  const path = '/api/v1/complaints';
  const as = (role: 'STUDENT' | 'ADMIN' | 'DRIVER', which: 'studentR1' | 'studentR2' | 'adminA' | 'adminB' | 'driver1') =>
    `Bearer ${h.token({ id: h.seed[which], campusId: which === 'adminB' ? h.seed.campusB : h.seed.campusA, role })}`;
  const invalid = { title: '  ', description: 'Details' };

  it('validates submission and restricts it to students', async () => {
    const client = request(h.app);
    expect((await client.post(path).set('Authorization', as('STUDENT', 'studentR1')).send(invalid)).status).toBe(400);
    expect((await client.post(path).set('Authorization', as('ADMIN', 'adminA')).send(invalid)).status).toBe(403);
    expect((await client.get(path).set('Authorization', as('DRIVER', 'driver1'))).status).toBe(403);
  });

  it('lists only permissible records and records response, resolution, and closure timestamps', async () => {
    const client = request(h.app);
    const student = as('STUDENT', 'studentR1');
    const admin = as('ADMIN', 'adminA');
    const created = await client.post(path).set('Authorization', student).send({ title: 'Late shuttle', description: 'The 08:30 shuttle departed at 08:45.', category: 'SCHEDULE_ISSUE' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'OPEN', studentId: h.seed.studentR1, resolvedAt: null });
    const url = `${path}/${created.body.id}`;
    for (const header of [as('STUDENT', 'studentR2'), as('ADMIN', 'adminB')]) {
      expect((await client.get(path).set('Authorization', header)).body.items).toEqual([]);
      expect((await client.get(url).set('Authorization', header)).status).toBe(404);
    }
    expect((await client.get(path).set('Authorization', student)).body.items[0].id).toBe(created.body.id);
    expect((await client.patch(url).set('Authorization', student).send({ status: 'RESOLVED' })).status).toBe(403);
    expect((await client.patch(url).set('Authorization', as('ADMIN', 'adminB')).send({ status: 'RESOLVED' })).status).toBe(404);
    expect((await client.patch(url).set('Authorization', admin).send({ studentId: h.seed.studentR2 })).status).toBe(400);
    expect((await client.patch(url).set('Authorization', admin).send({ status: 'CLOSED' })).status).toBe(409);
    const response = await client.patch(url).set('Authorization', admin).send({ status: 'IN_PROGRESS', adminResponse: 'We are checking the departure log.' });
    expect(response.status).toBe(200);
    expect(response.body.respondedAt).toEqual(expect.any(String));
    const resolved = await client.patch(url).set('Authorization', admin).send({ status: 'RESOLVED' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolvedAt).toEqual(expect.any(String));
    expect((await client.patch(url).set('Authorization', admin).send({ status: 'OPEN' })).status).toBe(409);
    const closed = await client.patch(url).set('Authorization', admin).send({ status: 'CLOSED' });
    expect(closed.body.closedAt).toEqual(expect.any(String));
    expect((await client.get(url).set('Authorization', student)).body).toMatchObject({ status: 'CLOSED', adminResponse: response.body.adminResponse });
  });
});
