import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, MONGO_URI, type Harness } from './harness';

describe.skipIf(!MONGO_URI)('CRUD APIs (buses, routes, schedules, notifications, alerts)', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const api = () => request(h.app);
  const admin = () => h.token({ id: h.seed.adminA, campusId: h.seed.campusA, role: 'ADMIN' });
  const driver = () => h.token({ id: h.seed.driver1, campusId: h.seed.campusA, role: 'DRIVER' });
  const student = () => h.token({ id: h.seed.studentR1, campusId: h.seed.campusA, role: 'STUDENT' });
  const get = (path: string, tok: string) => api().get(path).set('Authorization', `Bearer ${tok}`);
  const post = (path: string, body: object, tok: string) => api().post(path).set('Authorization', `Bearer ${tok}`).send(body);
  const patch = (path: string, body: object, tok: string) => api().patch(path).set('Authorization', `Bearer ${tok}`).send(body);
  const del = (path: string, tok: string) => api().delete(path).set('Authorization', `Bearer ${tok}`);

  // ── Buses ─────────────────────────────────────────────────────────────────
  describe('buses', () => {
    let busId: string;
    it('admin creates a bus', async () => {
      const r = await post('/api/v1/buses', { number: 'NEW01', capacity: 50 }, admin());
      expect(r.status).toBe(201);
      expect(r.body.number).toBe('NEW01');
      busId = r.body.id;
    });
    it('lists buses (all roles)', async () => {
      for (const tok of [admin(), driver(), student()]) {
        expect((await get('/api/v1/buses', tok)).status).toBe(200);
      }
    });
    it('student/driver cannot create a bus', async () => {
      expect((await post('/api/v1/buses', { number: 'X', capacity: 10 }, student())).status).toBe(403);
      expect((await post('/api/v1/buses', { number: 'X', capacity: 10 }, driver())).status).toBe(403);
    });
    it('admin updates bus status', async () => {
      const r = await patch(`/api/v1/buses/${busId}`, { status: 'MAINTENANCE' }, admin());
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('MAINTENANCE');
    });
    it('admin assigns driver and route to bus', async () => {
      const r = await post(`/api/v1/buses/${busId}/assign-driver`, { driverId: h.seed.driverFree }, admin());
      expect(r.status).toBe(200);
      expect(r.body.driverId).toBe(h.seed.driverFree);
      const r2 = await post(`/api/v1/buses/${busId}/assign-route`, { routeId: h.seed.route1 }, admin());
      expect(r2.status).toBe(200);
    });
    it('admin deletes bus', async () => {
      expect((await del(`/api/v1/buses/${busId}`, admin())).status).toBe(204);
      expect((await get(`/api/v1/buses/${busId}`, admin())).status).toBe(404);
    });
    it('unauthenticated request → 401', async () => {
      expect((await api().get('/api/v1/buses')).status).toBe(401);
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  describe('routes', () => {
    let routeId: string;
    it('admin creates a route with stops', async () => {
      const r = await post('/api/v1/routes', { code: 'RT99', name: 'Test Route', color: '#123456', stops: [{ name: 'Stop A', lat: 28.46, lng: 77.03, order: 0 }, { name: 'Stop B', lat: 28.47, lng: 77.04, order: 1 }] }, admin());
      expect(r.status).toBe(201);
      expect(r.body.stops).toHaveLength(2);
      routeId = r.body.id;
    });
    it('lists routes and gets by id', async () => {
      expect((await get('/api/v1/routes', student())).body.total).toBeGreaterThanOrEqual(1);
      expect((await get(`/api/v1/routes/${routeId}`, student())).body.stops).toHaveLength(2);
    });
    it('admin updates route name', async () => {
      const r = await patch(`/api/v1/routes/${routeId}`, { name: 'Updated Route' }, admin());
      expect(r.body.name).toBe('Updated Route');
    });
    it('admin deletes route', async () => {
      expect((await del(`/api/v1/routes/${routeId}`, admin())).status).toBe(204);
    });
    it('student/driver cannot create or delete routes', async () => {
      expect((await post('/api/v1/routes', { code: 'BAD', name: 'X' }, student())).status).toBe(403);
    });
  });

  // ── Schedules ─────────────────────────────────────────────────────────────
  describe('schedules', () => {
    let schedId: string;
    it('admin creates a schedule', async () => {
      const r = await post('/api/v1/schedules', { routeId: h.seed.route1, busId: h.seed.bus1, direction: 'TO_CAMPUS', daysOfWeek: [1, 2, 3, 4, 5], departTime: '08:00' }, admin());
      expect(r.status).toBe(201);
      expect(r.body.departTime).toBe('08:00');
      schedId = r.body.id;
    });
    it('lists schedules filtered by day', async () => {
      const r = await get('/api/v1/schedules?day=1', student());
      expect(r.status).toBe(200);
      expect(r.body.items.some((s: any) => s.id === schedId)).toBe(true);
      const r2 = await get('/api/v1/schedules?day=0', student()); // Sunday — not in schedule
      expect(r2.body.items.every((s: any) => s.id !== schedId)).toBe(true);
    });
    it('rejects invalid time format', async () => {
      const r = await post('/api/v1/schedules', { routeId: h.seed.route1, busId: h.seed.bus1, direction: 'TO_CAMPUS', daysOfWeek: [1], departTime: '8:00' }, admin());
      expect(r.status).toBe(400);
    });
    it('admin updates and deletes schedule', async () => {
      expect((await patch(`/api/v1/schedules/${schedId}`, { active: false }, admin())).body.active).toBe(false);
      expect((await del(`/api/v1/schedules/${schedId}`, admin())).status).toBe(204);
    });
    it('student cannot create/delete schedules', async () => {
      expect((await post('/api/v1/schedules', { routeId: h.seed.route1, busId: h.seed.bus1, direction: 'TO_CAMPUS', daysOfWeek: [1], departTime: '09:00' }, student())).status).toBe(403);
    });
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  describe('notifications', () => {
    let notifId: string;
    it('admin broadcasts a notification', async () => {
      const r = await post('/api/v1/notifications', { kind: 'ANNOUNCEMENT', priority: 'NORMAL', title: 'Route change today', body: 'Bus R1 will take the alternate route.' }, admin());
      expect(r.status).toBe(201);
      notifId = r.body.id;
    });
    it('all roles can list notifications', async () => {
      for (const tok of [admin(), driver(), student()]) {
        const r = await get('/api/v1/notifications', tok);
        expect(r.status).toBe(200);
        expect(r.body.items.some((n: any) => n.id === notifId)).toBe(true);
      }
    });
    it('rejects title shorter than 3 chars', async () => {
      expect((await post('/api/v1/notifications', { kind: 'DELAY', title: 'Hi', body: 'x' }, admin())).status).toBe(400);
    });
    it('admin deletes notification', async () => {
      expect((await del(`/api/v1/notifications/${notifId}`, admin())).status).toBe(204);
    });
    it('student cannot create notifications', async () => {
      expect((await post('/api/v1/notifications', { kind: 'DELAY', title: 'Test Delay Notice', body: 'x' }, student())).status).toBe(403);
    });
  });

  // ── Emergency alerts ──────────────────────────────────────────────────────
  describe('emergency alerts', () => {
    let alertId: string;
    it('driver raises an emergency alert', async () => {
      const r = await post('/api/v1/alerts', { busId: h.seed.bus1, message: 'Breakdown on route', location: { lat: 28.46, lng: 77.03 } }, driver());
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('OPEN');
      alertId = r.body.id;
    });
    it('student cannot raise alerts', async () => {
      expect((await post('/api/v1/alerts', { busId: h.seed.bus1 }, student())).status).toBe(403);
    });
    it('admin lists open alerts', async () => {
      const r = await get('/api/v1/alerts?status=OPEN', admin());
      expect(r.status).toBe(200);
      expect(r.body.items.some((a: any) => a.id === alertId)).toBe(true);
    });
    it('admin acknowledges then resolves alert', async () => {
      const ack = await post(`/api/v1/alerts/${alertId}/acknowledge`, {}, admin());
      expect(ack.status).toBe(200);
      expect(ack.body.status).toBe('ACKNOWLEDGED');
      const res = await post(`/api/v1/alerts/${alertId}/resolve`, {}, admin());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('RESOLVED');
    });
    it('resolving an already-resolved alert → 404', async () => {
      expect((await post(`/api/v1/alerts/${alertId}/resolve`, {}, admin())).status).toBe(404);
    });
    it('student cannot list alerts', async () => {
      expect((await get('/api/v1/alerts', student())).status).toBe(403);
    });
  });

  // ── User management ───────────────────────────────────────────────────────
  describe('user management (admin)', () => {
    it('admin lists users filtered by role', async () => {
      const r = await get('/api/v1/users?role=DRIVER', admin());
      expect(r.status).toBe(200);
      expect(r.body.items.every((u: any) => u.role === 'DRIVER')).toBe(true);
    });
    it('admin updates driver status to ACTIVE', async () => {
      expect((await patch(`/api/v1/users/${h.seed.driverFree}/status`, { status: 'ACTIVE' }, admin())).status).toBe(204);
    });
    it('admin assigns transport to student', async () => {
      expect((await post(`/api/v1/users/${h.seed.studentNone}/assign-transport`, { busId: h.seed.bus1, routeId: h.seed.route1 }, admin())).status).toBe(204);
    });
    it('student cannot manage other users', async () => {
      expect((await patch(`/api/v1/users/${h.seed.driver1}/status`, { status: 'DISABLED' }, student())).status).toBe(403);
      expect((await get('/api/v1/users', student())).status).toBe(403);
    });
    it('GET /me returns own profile', async () => {
      const r = await get('/api/v1/users/me', student());
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(h.seed.studentR1);
    });
  });
});
