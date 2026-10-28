import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { BusDTO, Principal, Role, UserDTO, UserStatus } from '../src/domain/types';

const CAMPUS_A = 'a'.repeat(24);
const CAMPUS_B = 'b'.repeat(24);
const SECRET = 'a-very-long-secret-for-tests-0123456789abcdef';
const id = (n: number) => n.toString(16).padStart(24, '0');

const BUS_ID = id(1);
const DRIVER_A = id(2);
const STUDENT_A = id(3);
const DRIVER_B = id(4);
const PENDING_A = id(5);
const ADMIN_A = id(6);
const MISSING = id(9);

function token(userId: string, role: Role, campusId = CAMPUS_A) {
  return signAccessToken({ userId, campusId, role } as Principal, SECRET);
}

describe('POST /api/v1/buses/:id/assign-driver authorization', () => {
  let buses: Map<string, BusDTO>;
  let users: Map<string, UserDTO>;
  let app: ReturnType<typeof createApp>;
  let writes: number;

  beforeEach(() => {
    writes = 0;
    buses = new Map([[BUS_ID, {
      id: BUS_ID, campusId: CAMPUS_A, number: 'B1', capacity: 40, status: 'ACTIVE', driverId: null, routeId: null,
    }]]);
    users = new Map<string, UserDTO>([
      [DRIVER_A, { id: DRIVER_A, campusId: CAMPUS_A, email: 'd@a.test', name: 'D', role: 'DRIVER', status: 'ACTIVE' as UserStatus, emailVerifiedAt: null }],
      [STUDENT_A, { id: STUDENT_A, campusId: CAMPUS_A, email: 's@a.test', name: 'S', role: 'STUDENT', status: 'ACTIVE' as UserStatus, emailVerifiedAt: null }],
      [DRIVER_B, { id: DRIVER_B, campusId: CAMPUS_B, email: 'd@b.test', name: 'DB', role: 'DRIVER', status: 'ACTIVE' as UserStatus, emailVerifiedAt: null }],
      [PENDING_A, { id: PENDING_A, campusId: CAMPUS_A, email: 'p@a.test', name: 'P', role: 'DRIVER', status: 'PENDING' as UserStatus, emailVerifiedAt: null }],
      [ADMIN_A, { id: ADMIN_A, campusId: CAMPUS_A, email: 'a@a.test', name: 'A', role: 'ADMIN', status: 'ACTIVE' as UserStatus, emailVerifiedAt: null }],
    ]);
    app = createApp({
      ingest: {} as any, trips: {} as any, live: {} as any, auth: {} as any, routes: {} as any, tripRepo: {} as any,
      verifyToken: (t) => verifyAccessToken(t, SECRET),
      allowedOrigins: ['https://campus-move-one.vercel.app'],
      users: {
        findById: async (campusId: string, uid: string) => {
          const u = users.get(uid);
          return u && u.campusId === campusId ? u : null;
        },
      } as any,
      buses: {
        assignDriver: async (campusId: string, busId: string, driverId: string | null) => {
          writes += 1;
          const b = buses.get(busId);
          if (!b || b.campusId !== campusId) return null;
          b.driverId = driverId;
          return { ...b };
        },
        findById: async (campusId: string, busId: string) => {
          const b = buses.get(busId);
          return b && b.campusId === campusId ? b : null;
        },
      } as any,
    });
  });

  const post = (busId: string, body: object, tok: string) =>
    request(app).post(`/api/v1/buses/${busId}/assign-driver`).set('Authorization', `Bearer ${tok}`).send(body);

  it('assigns an ACTIVE same-campus DRIVER', async () => {
    const r = await post(BUS_ID, { driverId: DRIVER_A }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(200);
    expect(r.body.driverId).toBe(DRIVER_A);
    expect(writes).toBe(1);
  });

  it('rejects a non-driver target without writing', async () => {
    const r = await post(BUS_ID, { driverId: STUDENT_A }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('NOT_A_DRIVER');
    expect(buses.get(BUS_ID)!.driverId).toBeNull();
    expect(writes).toBe(0);
  });

  it('rejects a missing driver without writing', async () => {
    const r = await post(BUS_ID, { driverId: MISSING }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('DRIVER_NOT_FOUND');
    expect(writes).toBe(0);
  });

  it('rejects a cross-campus driver without writing', async () => {
    const r = await post(BUS_ID, { driverId: DRIVER_B }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('DRIVER_NOT_FOUND');
    expect(writes).toBe(0);
  });

  it('rejects a PENDING driver without writing', async () => {
    const r = await post(BUS_ID, { driverId: PENDING_A }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('DRIVER_NOT_ELIGIBLE');
    expect(writes).toBe(0);
  });

  it('rejects an unknown bus without writing', async () => {
    const r = await post(id(8), { driverId: DRIVER_A }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('BUS_NOT_FOUND');
    expect(writes).toBe(0);
  });

  it('rejects a student (unauthorized role)', async () => {
    const r = await post(BUS_ID, { driverId: DRIVER_A }, token(STUDENT_A, 'STUDENT'));
    expect(r.status).toBe(403);
    expect(writes).toBe(0);
  });

  it('rejects unauthenticated requests', async () => {
    const r = await request(app).post(`/api/v1/buses/${BUS_ID}/assign-driver`).send({ driverId: DRIVER_A });
    expect(r.status).toBe(401);
    expect(writes).toBe(0);
  });

  it('allows unassigning a driver with null', async () => {
    buses.get(BUS_ID)!.driverId = DRIVER_A;
    const r = await post(BUS_ID, { driverId: null }, token(ADMIN_A, 'ADMIN'));
    expect(r.status).toBe(200);
    expect(r.body.driverId).toBeNull();
  });
});
