import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-dashboard-jwt-secret-key-minimum-32-chars!!';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-dashboard-api-'));
process.chdir(tmpDir);

const { initDatabase, db } = await import('../server/db');
const { getJwtSecret } = await import('../server/middleware/auth');
const authRoutes = (await import('../server/routes/auth')).default;
const busRoutes = (await import('../server/routes/buses')).default;
const analyticsRoutes = (await import('../server/routes/analytics')).default;
const userRoutes = (await import('../server/routes/users')).default;
const collegeRoutes = (await import('../server/routes/colleges')).default;

function tokenFor(user: { id: string; college_id: string; role: 'STUDENT' | 'DRIVER' | 'ADMIN'; email: string; name: string }) {
  return jwt.sign(
    { userId: user.id, collegeId: user.college_id, role: user.role, email: user.email, name: user.name },
    getJwtSecret(),
    { expiresIn: '1h' }
  );
}

describe('dashboard APIs', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/buses', busRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/colleges', collegeRoutes);

  let collegeId = '';
  let student: any;
  let driver: any;
  let admin: any;
  let bus: any;

  beforeAll(async () => {
    await initDatabase();
    collegeId = (await db.getColleges())[0].id;
    const users = await db.getUsersByCollege(collegeId);
    student = users.find((u: any) => u.role === 'STUDENT');
    driver = users.find((u: any) => u.role === 'DRIVER');
    admin = users.find((u: any) => u.role === 'ADMIN');
    bus = (await db.getBuses(collegeId))[0];
  });

  afterAll(() => {
    process.chdir('/workspace');
  });

  it('rejects driver and admin self-registration', async () => {
    const driverRes = await request(app).post('/api/auth/register').send({
      email: 'new.driver@apex.edu',
      password: 'Password1!',
      name: 'New Driver',
      role: 'DRIVER',
      collegeId,
    });
    expect(driverRes.status).toBe(403);

    const adminRes = await request(app).post('/api/auth/register').send({
      email: 'new.admin@apex.edu',
      password: 'Password1!',
      name: 'New Admin',
      role: 'ADMIN',
      collegeId,
    });
    expect(adminRes.status).toBe(403);
  });

  it('changes password when the current password is valid', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${tokenFor(student)}`)
      .send({ currentPassword: 'ApexBus2025!', newPassword: 'NewPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: student.email,
      password: 'NewPass123!',
    });
    expect(loginRes.status).toBe(200);
  });

  it('lets admins assign a driver to a bus', async () => {
    const res = await request(app)
      .put(`/api/buses/${bus.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ currentDriverId: driver.id });
    expect(res.status).toBe(200);
    expect(res.body.current_driver_id).toBe(driver.id);
  });

  it('restricts analytics to admins', async () => {
    const studentRes = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${tokenFor(student)}`);
    expect(studentRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.fleetSize).toBeDefined();
  });

  it('lists campus users for admins without password hashes', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((u: any) => u.role === 'DRIVER')).toBe(true);
    expect(res.body.some((u: any) => u.role === 'STUDENT')).toBe(true);
    expect(res.body.every((u: any) => !u.password_hash && !u.passwordHash)).toBe(true);
  });

  it('persists college settings for admins', async () => {
    const res = await request(app)
      .put(`/api/colleges/${collegeId}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({
        name: 'Apex State University',
        settings: { emergencyPhone: '(555) 100-2000', telemetryIntervalSec: 5 },
      });
    expect(res.status).toBe(200);
    expect(res.body.settings.emergencyPhone).toBe('(555) 100-2000');
    expect(res.body.settings.telemetryIntervalSec).toBe(5);
    expect(res.body.shortCode).toBeTypeOf('string');
    expect(res.body.centerLocation).toBeDefined();
  });

  it('lists colleges with a public DTO for the login campus selector', async () => {
    const res = await request(app).get('/api/colleges');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(collegeId);
    expect(res.body[0].shortCode).toBeTypeOf('string');
    expect(res.body[0].centerLocation).toEqual({
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
  });

  it('lets admins create DRIVER accounts and rejects students creating users', async () => {
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({
        email: 'new.driver@campus.test',
        password: 'Password1!',
        name: 'New Driver',
        role: 'DRIVER',
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email: 'new.driver@campus.test',
      role: 'DRIVER',
      status: 'ACTIVE',
    });
    expect(created.body.password_hash).toBeUndefined();

    const studentRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenFor(student)}`)
      .send({
        email: 'blocked@campus.test',
        password: 'Password1!',
        name: 'Blocked',
        role: 'DRIVER',
      });
    expect(studentRes.status).toBe(403);
  });

  it('rejects bootstrap-admin when an administrator already exists', async () => {
    const previous = process.env.BOOTSTRAP_SECRET;
    process.env.BOOTSTRAP_SECRET = 'test-bootstrap-secret';
    const res = await request(app)
      .post('/api/auth/bootstrap-admin')
      .set('x-bootstrap-secret', 'test-bootstrap-secret')
      .send({
        email: 'bootstrap@campus.test',
        password: 'Password1!',
        name: 'Bootstrap Admin',
      });
    if (previous === undefined) delete process.env.BOOTSTRAP_SECRET;
    else process.env.BOOTSTRAP_SECRET = previous;
    expect(res.status).toBe(409);
  });
});
