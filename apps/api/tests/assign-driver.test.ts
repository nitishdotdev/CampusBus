import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { BusDTO, Principal, UserDTO } from '../src/domain/types';

const CAMPUS_A = 'a'.repeat(24);
const CAMPUS_B = 'c'.repeat(24);
const BUS_ID = '1'.repeat(24);
const DRIVER_ID = '2'.repeat(24);
const STUDENT_ID = '3'.repeat(24);
const ADMIN_ID = '4'.repeat(24);
const PENDING_ID = '5'.repeat(24);
const FOREIGN_ID = '6'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';

const bus: BusDTO = {
  id: BUS_ID, campusId: CAMPUS_A, number: 'B1', capacity: 40, status: 'ACTIVE',
  driverId: null, routeId: null,
};

const users: Record<string, UserDTO> = {
  [DRIVER_ID]: {
    id: DRIVER_ID, campusId: CAMPUS_A, email: 'd@t.test', name: 'Driver',
    role: 'DRIVER', status: 'ACTIVE', emailVerifiedAt: new Date(),
  },
  [STUDENT_ID]: {
    id: STUDENT_ID, campusId: CAMPUS_A, email: 's@t.test', name: 'Student',
    role: 'STUDENT', status: 'ACTIVE', emailVerifiedAt: new Date(),
  },
  [PENDING_ID]: {
    id: PENDING_ID, campusId: CAMPUS_A, email: 'p@t.test', name: 'Pending',
    role: 'DRIVER', status: 'PENDING', emailVerifiedAt: null,
  },
  [FOREIGN_ID]: {
    id: FOREIGN_ID, campusId: CAMPUS_B, email: 'f@t.test', name: 'Foreign',
    role: 'DRIVER', status: 'ACTIVE', emailVerifiedAt: new Date(),
  },
};

function token(p: Principal) {
  return signAccessToken(p, SECRET);
}

function makeApp() {
  const assigned: { campusId: string; busId: string; driverId: string | null }[] = [];
  const app = createApp({
    ingest: { ingest: async () => ({}) },
    trips: { start: async () => ({}), end: async () => ({}) },
    live: { snapshot: async () => ({}) },
    auth: {} as any,
    users: {
      findById: async (campusId: string, id: string) => {
        const u = users[id];
        if (!u || u.campusId !== campusId) return null;
        return u;
      },
    } as any,
    buses: {
      findById: async (campusId: string, id: string) =>
        (campusId === bus.campusId && id === bus.id ? { ...bus } : null),
      assignDriver: async (campusId: string, id: string, driverId: string | null) => {
        if (campusId !== bus.campusId || id !== bus.id) return null;
        assigned.push({ campusId, busId: id, driverId });
        return { ...bus, driverId };
      },
    } as any,
    routes: {},
    tripRepo: {},
    verifyToken: (t: string) => verifyAccessToken(t, SECRET),
    allowedOrigins: [],
  } as any);
  return { app, assigned };
}

const adminTok = () => token({ userId: ADMIN_ID, campusId: CAMPUS_A, role: 'ADMIN' });

describe('POST /api/v1/buses/:id/assign-driver', () => {
  it('assigns an ACTIVE driver in the admin campus', async () => {
    const { app, assigned } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: DRIVER_ID });
    expect(res.status).toBe(200);
    expect(res.body.driverId).toBe(DRIVER_ID);
    expect(assigned).toEqual([{ campusId: CAMPUS_A, busId: BUS_ID, driverId: DRIVER_ID }]);
  });

  it('unassigns when driverId is null', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: null });
    expect(res.status).toBe(200);
    expect(res.body.driverId).toBeNull();
  });

  it('rejects an unknown driver', async () => {
    const { app, assigned } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: '9'.repeat(24) });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DRIVER_NOT_FOUND');
    expect(assigned).toHaveLength(0);
  });

  it('rejects a student as the assigned driver', async () => {
    const { app, assigned } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: STUDENT_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DRIVER');
    expect(assigned).toHaveLength(0);
  });

  it('rejects a PENDING driver', async () => {
    const { app, assigned } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: PENDING_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DRIVER_NOT_ACTIVE');
    expect(assigned).toHaveLength(0);
  });

  it('does not assign a driver from another campus even if body.campusId claims otherwise', async () => {
    const { app, assigned } = makeApp();
    const res = await request(app)
      .post(`/api/v1/buses/${BUS_ID}/assign-driver`)
      .set('Authorization', `Bearer ${adminTok()}`)
      .send({ driverId: FOREIGN_ID, campusId: CAMPUS_B, role: 'ADMIN' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DRIVER_NOT_FOUND');
    expect(assigned).toHaveLength(0);
  });
});
