import { describe, expect, it } from 'vitest';
import { canViewBus } from '../src/domain/access';
import { loadTrackingConfig } from '../src/config/env';
import type { BusDTO, Principal, UserDTO } from '../src/domain/types';

const CAMPUS_A = 'a'.repeat(24);
const CAMPUS_B = 'e'.repeat(24);
const ROUTE = 'c'.repeat(24);

const bus = (campusId: string): BusDTO => ({
  id: 'b'.repeat(24), campusId, number: 'B-1', capacity: 30, status: 'ACTIVE', driverId: null, routeId: ROUTE,
});
const student = (campusId: string, assignedRouteId: string): UserDTO => ({
  id: 'd'.repeat(24), campusId, email: 's@x.test', name: 'S', role: 'STUDENT', status: 'ACTIVE',
  emailVerifiedAt: new Date(), assignedBusId: null, assignedRouteId,
});

describe('cross-campus isolation for live positions', () => {
  it('denies an admin of another campus any view of this campus bus', () => {
    const admin: Principal = { userId: 'f'.repeat(24), campusId: CAMPUS_B, role: 'ADMIN' };
    const adminUser: UserDTO = { ...student(CAMPUS_B, ROUTE), role: 'ADMIN' };
    expect(canViewBus(admin, adminUser, bus(CAMPUS_A))).toBe(false);
  });

  it('denies a student on a route with the same id but another campus', () => {
    const principal: Principal = { userId: 'd'.repeat(24), campusId: CAMPUS_B, role: 'STUDENT' };
    expect(canViewBus(principal, student(CAMPUS_B, ROUTE), bus(CAMPUS_A))).toBe(false);
  });

  it('allows a student on the bus route within their own campus', () => {
    const principal: Principal = { userId: 'd'.repeat(24), campusId: CAMPUS_A, role: 'STUDENT' };
    expect(canViewBus(principal, student(CAMPUS_A, ROUTE), bus(CAMPUS_A))).toBe(true);
  });
});

describe('production simulation prevention', () => {
  it('refuses to load a production configuration that enables simulation', () => {
    expect(() => loadTrackingConfig({ NODE_ENV: 'production', SIMULATION_MODE: 'on' } as any)).toThrow(/not permitted/);
  });

  it('defaults simulation off, including in production', () => {
    expect(loadTrackingConfig({ NODE_ENV: 'production' } as any).simulationEnabled).toBe(false);
    expect(loadTrackingConfig({} as any).simulationEnabled).toBe(false);
  });
});
