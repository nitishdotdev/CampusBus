import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/http/app';
import { assertAssignableDriver } from '../src/domain/access';
import { DomainError } from '../src/domain/errors';
import { DEFAULT_TRACKING } from '../src/config/env';
import { TripService } from '../src/domain/trips';
import type { BusDTO, Principal, Role, UserDTO } from '../src/domain/types';

const campusA = 'a'.repeat(24);
const campusB = 'b'.repeat(24);
const busId = '1'.repeat(24);
const driverId = '2'.repeat(24);
const studentId = '3'.repeat(24);
const adminId = '4'.repeat(24);
const pendingId = '5'.repeat(24);
const missingId = '6'.repeat(24);
const crossId = '7'.repeat(24);
const otherBus = '8'.repeat(24);

const user = (o: Partial<UserDTO> & { id: string; role: Role; campusId?: string; status?: UserDTO['status'] }): UserDTO => ({
  email: `${o.id}@t.test`, name: 'U', status: 'ACTIVE', emailVerifiedAt: null, campusId: campusA, ...o,
});

describe('assertAssignableDriver', () => {
  it('accepts an ACTIVE DRIVER on the same campus', () => {
    expect(() => assertAssignableDriver(campusA, user({ id: driverId, role: 'DRIVER' }))).not.toThrow();
  });
  it('rejects a missing driver without writing', () => {
    expect(() => assertAssignableDriver(campusA, null)).toThrow(DomainError);
    try { assertAssignableDriver(campusA, null); } catch (e) {
      expect(e).toMatchObject({ status: 404, code: 'DRIVER_NOT_FOUND' });
    }
  });
  it('rejects a non-driver', () => {
    try { assertAssignableDriver(campusA, user({ id: studentId, role: 'STUDENT' })); } catch (e) {
      expect(e).toMatchObject({ status: 400, code: 'TARGET_NOT_DRIVER' });
    }
  });
  it('rejects a cross-campus driver as not found', () => {
    try { assertAssignableDriver(campusA, user({ id: crossId, role: 'DRIVER', campusId: campusB })); } catch (e) {
      expect(e).toMatchObject({ status: 404, code: 'DRIVER_NOT_FOUND' });
    }
  });
  it('rejects pending, rejected, and disabled drivers', () => {
    for (const status of ['PENDING', 'REJECTED', 'DISABLED'] as const) {
      try { assertAssignableDriver(campusA, user({ id: pendingId, role: 'DRIVER', status })); } catch (e) {
        expect(e).toMatchObject({ status: 403, code: 'DRIVER_NOT_ELIGIBLE' });
      }
    }
  });
});

describe('POST /api/v1/buses/:id/assign-driver', () => {
  let buses: Record<string, BusDTO>;
  let users: Record<string, UserDTO>;
  let writes: { busId: string; driverId: string | null }[];

  beforeEach(() => {
    writes = [];
    buses = {
      [busId]: { id: busId, campusId: campusA, number: 'B1', capacity: 40, status: 'ACTIVE', driverId: null, routeId: null },
    };
    users = {
      [driverId]: user({ id: driverId, role: 'DRIVER' }),
      [studentId]: user({ id: studentId, role: 'STUDENT' }),
      [adminId]: user({ id: adminId, role: 'ADMIN' }),
      [pendingId]: user({ id: pendingId, role: 'DRIVER', status: 'PENDING' }),
      [crossId]: user({ id: crossId, role: 'DRIVER', campusId: campusB }),
    };
  });

  function app(role: Role | null = 'ADMIN', campusId = campusA) {
    const dummy = async () => { throw new Error('unused'); };
    return createApp({
      ingest: { ingest: dummy } as unknown as AppDeps['ingest'],
      trips: { start: dummy, end: dummy } as unknown as AppDeps['trips'],
      live: { snapshot: dummy } as unknown as AppDeps['live'],
      auth: { login: dummy, register: dummy, refresh: dummy, logout: dummy, logoutAll: dummy } as unknown as AppDeps['auth'],
      users: {
        findById: async (c: string, uid: string) => Object.values(users).find((u) => u.id === uid && u.campusId === c) ?? null,
        list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }),
        updateStatus: async () => false,
        assignTransport: async () => false,
      } as unknown as AppDeps['users'],
      buses: {
        list: async () => ({ items: Object.values(buses), total: 1, page: 1, pageSize: 25 }),
        findById: async (c: string, bid: string) => buses[bid]?.campusId === c ? buses[bid]! : null,
        create: dummy,
        update: async () => null,
        delete: async () => false,
        assignDriver: async (c: string, bid: string, dId: string | null) => {
          const bus = buses[bid];
          if (!bus || bus.campusId !== c) return null;
          writes.push({ busId: bid, driverId: dId });
          bus.driverId = dId;
          return { ...bus };
        },
        assignRoute: async () => null,
      } as unknown as AppDeps['buses'],
      routes: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), findById: async () => null, create: dummy, update: async () => null, delete: async () => false } as unknown as AppDeps['routes'],
      tripRepo: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) } as unknown as AppDeps['tripRepo'],
      verifyToken: () => (role ? { userId: adminId, campusId, role } : null),
      allowedOrigins: ['https://campusmove.vercel.app'],
    });
  }

  const assign = (a: ReturnType<typeof app>, id: string, body: object, token = 't') =>
    request(a).post(`/api/v1/buses/${id}/assign-driver`).set('Authorization', `Bearer ${token}`).set('Origin', 'https://campusmove.vercel.app').send(body);

  it('assigns an ACTIVE same-campus driver', async () => {
    const res = await assign(app(), busId, { driverId });
    expect(res.status).toBe(200);
    expect(res.body.driverId).toBe(driverId);
    expect(writes).toEqual([{ busId, driverId }]);
  });

  it('rejects a non-driver target and does not persist', async () => {
    const res = await assign(app(), busId, { driverId: studentId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TARGET_NOT_DRIVER');
    expect(writes).toHaveLength(0);
    expect(buses[busId]!.driverId).toBeNull();
  });

  it('rejects a missing driver and does not persist', async () => {
    const res = await assign(app(), busId, { driverId: missingId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DRIVER_NOT_FOUND');
    expect(writes).toHaveLength(0);
  });

  it('rejects a cross-campus driver and does not persist', async () => {
    const res = await assign(app(), busId, { driverId: crossId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DRIVER_NOT_FOUND');
    expect(writes).toHaveLength(0);
  });

  it('rejects a pending driver and does not persist', async () => {
    const res = await assign(app(), busId, { driverId: pendingId });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DRIVER_NOT_ELIGIBLE');
    expect(writes).toHaveLength(0);
  });

  it('rejects an unknown bus without writing', async () => {
    const res = await assign(app(), otherBus, { driverId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('BUS_NOT_FOUND');
    expect(writes).toHaveLength(0);
  });

  it('rejects a student requester', async () => {
    const res = await assign(app('STUDENT'), busId, { driverId });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('rejects an unauthenticated requester', async () => {
    const res = await assign(app(null), busId, { driverId });
    expect(res.status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('allows unassigning a driver with null', async () => {
    buses[busId]!.driverId = driverId;
    const res = await assign(app(), busId, { driverId: null });
    expect(res.status).toBe(200);
    expect(res.body.driverId).toBeNull();
    expect(writes).toEqual([{ busId, driverId: null }]);
  });
});

describe('pending drivers cannot start trips', () => {
  it('TripService.start refuses PENDING drivers before persisting a trip', async () => {
    let started = false;
    const trips = new TripService({
      users: { findById: async () => user({ id: pendingId, role: 'DRIVER', status: 'PENDING' }) } as never,
      buses: { findById: async () => ({ id: busId, campusId: campusA, number: 'B1', capacity: 40, status: 'ACTIVE', driverId: pendingId, routeId: '9'.repeat(24) }) } as never,
      trips: { start: async () => { started = true; throw new Error('must not persist'); } } as never,
      config: DEFAULT_TRACKING,
    });
    const principal: Principal = { userId: pendingId, campusId: campusA, role: 'DRIVER' };
    await expect(trips.start(principal, { busId })).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' });
    expect(started).toBe(false);
  });
});
