import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';

process.env.JWT_SECRET = 'test-trip-gps-jwt-secret-key-minimum-32-chars!!';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-trip-gps-'));
process.chdir(tmpDir);

const { initDatabase, db } = await import('../server/db');
const { getJwtSecret } = await import('../server/middleware/auth');
const { initSocketIO } = await import('../server/socket');
const authRoutes = (await import('../server/routes/auth')).default;
const busRoutes = (await import('../server/routes/buses')).default;
const tripRoutes = (await import('../server/routes/trips')).default;
const driverRoutes = (await import('../server/routes/driver')).default;

function tokenFor(user: { id: string; college_id: string; role: 'STUDENT' | 'DRIVER' | 'ADMIN'; email: string; name: string }) {
  return jwt.sign(
    { userId: user.id, collegeId: user.college_id, role: user.role, email: user.email, name: user.name },
    getJwtSecret(),
    { expiresIn: '1h' }
  );
}

describe('assignment to trip to real GPS workflow', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/buses', busRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/driver', driverRoutes);

  const httpServer = http.createServer(app);
  let socketBase = '';

  let collegeId = '';
  let student: any;
  let driver: any;
  let secondDriver: any;
  let admin: any;
  let idleBus: any;
  let route: any;

  beforeAll(async () => {
    await initDatabase();
    initSocketIO(httpServer, ['http://127.0.0.1']);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    socketBase = `http://127.0.0.1:${(httpServer.address() as any).port}`;

    collegeId = (await db.getColleges())[0].id;
    const users = await db.getUsersByCollege(collegeId);
    student = users.find((u: any) => u.role === 'STUDENT');
    secondDriver = users.find((u: any) => u.role === 'DRIVER' && u.id === 'usr_driver_elena');
    admin = users.find((u: any) => u.role === 'ADMIN');
    idleBus = (await db.getBuses(collegeId)).find((b: any) => b.id === 'bus_102');
    route = (await db.getRoutes(collegeId)).find((r: any) => r.id === 'route_green');
    driver = await db.createUser({
      id: 'usr_driver_workflow',
      college_id: collegeId,
      email: 'workflow.driver@apex.edu',
      password_hash: admin.password_hash,
      name: 'Workflow Driver',
      role: 'DRIVER',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    process.chdir('/workspace');
  });

  it('does not advertise LIVE GPS for buses that have no active trip', async () => {
    const res = await request(app)
      .get('/api/buses')
      .set('Authorization', `Bearer ${tokenFor(student)}`);
    expect(res.status).toBe(200);
    const idle = res.body.find((b: any) => b.id === 'bus_102');
    expect(idle.status).not.toBe('ACTIVE');
    expect(idle.etaConfidence).not.toBe('LIVE');
  });

  it('blocks a driver from starting a trip on a bus that is not assigned to them', async () => {
    const res = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, routeId: route.id });
    expect(res.status).toBe(403);
  });

  it('blocks GPS from a driver who is not assigned to the bus', async () => {
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, lat: 34.0537, lng: -118.257, speed: 4, heading: 90, accuracy: 8 });
    expect(res.status).toBe(403);
  });

  it('lets an admin assign a driver, then that driver can start a trip', async () => {
    const assign = await request(app)
      .put(`/api/buses/${idleBus.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ currentDriverId: driver.id, currentRouteId: route.id });
    expect(assign.status).toBe(200);
    expect(assign.body.current_driver_id).toBe(driver.id);

    const start = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, routeId: route.id });
    expect(start.status).toBe(201);
    expect(start.body.trip.status).toBe('IN_PROGRESS');
    expect(start.body.bus.status).toBe('ACTIVE');
    expect(start.body.bus.eta_confidence).not.toBe('LIVE');
  });

  it('rejects a second trip on the same bus and a second trip by the same driver', async () => {
    const otherBusConflict = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${tokenFor(secondDriver)}`)
      .send({ busId: idleBus.id, routeId: route.id });
    expect(otherBusConflict.status).toBe(409);

    const sameDriver = await request(app)
      .post('/api/trips/start')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, routeId: route.id });
    expect(sameDriver.status).toBe(409);
  });

  it('blocks reassignment while a trip is in progress', async () => {
    const res = await request(app)
      .put(`/api/buses/${idleBus.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ currentDriverId: secondDriver.id });
    expect(res.status).toBe(409);
  });

  it('rejects invalid GPS coordinates and persists a valid breadcrumb', async () => {
    const invalid = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, lat: 999, lng: -118.257, speed: 5, heading: 10, accuracy: 6 });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({
        busId: idleBus.id,
        lat: 34.0512,
        lng: -118.2548,
        speed: 6.2,
        heading: 42,
        accuracy: 7,
        timestamp: new Date().toISOString(),
      });
    expect(valid.status).toBe(200);
    expect(valid.body.success).toBe(true);
    expect(['LIVE', 'DEGRADED']).toContain(valid.body.confidence);

    const fleet = await request(app)
      .get('/api/buses')
      .set('Authorization', `Bearer ${tokenFor(student)}`);
    const liveBus = fleet.body.find((b: any) => b.id === idleBus.id);
    expect(liveBus.status).toBe('ACTIVE');
    expect(liveBus.lastLocation.lat).toBeCloseTo(34.0512, 4);
    expect(liveBus.lastLocation.lng).toBeCloseTo(-118.2548, 4);
    expect(liveBus.etaConfidence).toBe('LIVE');
  });

  it('ends the trip, stops treating the bus as live, and refuses further GPS', async () => {
    const end = await request(app)
      .post('/api/trips/end')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({});
    expect(end.status).toBe(200);
    expect(end.body.success).toBe(true);

    const fleet = await request(app)
      .get('/api/buses')
      .set('Authorization', `Bearer ${tokenFor(student)}`);
    const bus = fleet.body.find((b: any) => b.id === idleBus.id);
    expect(bus.status).toBe('IDLE');
    expect(bus.etaConfidence).toBe('SCHEDULED');
    expect(bus.speedKmh).toBe(0);

    const gps = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${tokenFor(driver)}`)
      .send({ busId: idleBus.id, lat: 34.06, lng: -118.26, speed: 3, heading: 1, accuracy: 5 });
    expect(gps.status).toBe(403);
  });

  it('rejects Socket.IO connections without a token', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = ioClient(socketBase, {
        path: '/socket.io/',
        transports: ['websocket'],
        timeout: 3000,
        reconnection: false,
      });
      socket.on('connect', () => {
        socket.close();
        reject(new Error('unauthenticated socket connected'));
      });
      socket.on('connect_error', (err) => {
        expect(String(err.message)).toMatch(/token|auth/i);
        socket.close();
        resolve();
      });
    });
  });
});
