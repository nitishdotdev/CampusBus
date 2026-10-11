import { describe, expect, it } from 'vitest';
import { canViewBus } from '../src/domain/access';
import { computeFreshness } from '../src/domain/telemetry/freshness';
import { haversineMeters } from '../src/domain/telemetry/geo';
import { EventRateLimiter } from '../src/domain/rateLimiter';
import type { BusDTO, Principal, TripDTO, UserDTO, VehicleLocationDTO } from '../src/domain/types';

const campus = 'a'.repeat(24), other = 'b'.repeat(24);
const bus: BusDTO = { id: '1'.repeat(24), campusId: campus, number: 'B1', capacity: 40, status: 'ACTIVE', driverId: '2'.repeat(24), routeId: '3'.repeat(24) };
const user = (o: Partial<UserDTO>): UserDTO => ({ id: '9'.repeat(24), campusId: campus, role: 'STUDENT', status: 'ACTIVE', ...o });
const pr = (u: UserDTO, campusId = u.campusId): Principal => ({ userId: u.id, campusId, role: u.role });

describe('canViewBus (pure policy)', () => {
  it('admin: any bus in own campus only', () => {
    const u = user({ role: 'ADMIN' });
    expect(canViewBus(pr(u), u, bus)).toBe(true);
    expect(canViewBus(pr(u), u, { ...bus, campusId: other })).toBe(false);
    expect(canViewBus(pr(u, other), u, bus)).toBe(false);
  });
  it('driver: only the bus assigned to them', () => {
    const own = user({ role: 'DRIVER', id: bus.driverId! });
    expect(canViewBus(pr(own), own, bus)).toBe(true);
    const stranger = user({ role: 'DRIVER' });
    expect(canViewBus(pr(stranger), stranger, bus)).toBe(false);
  });
  it('student: assigned bus or a bus on the assigned route, nothing else', () => {
    const byBus = user({ assignedBusId: bus.id }); const byRoute = user({ assignedRouteId: bus.routeId });
    const none = user({}); const wrong = user({ assignedRouteId: 'c'.repeat(24), assignedBusId: 'd'.repeat(24) });
    expect(canViewBus(pr(byBus), byBus, bus)).toBe(true);
    expect(canViewBus(pr(byRoute), byRoute, bus)).toBe(true);
    expect(canViewBus(pr(none), none, bus)).toBe(false);
    expect(canViewBus(pr(wrong), wrong, bus)).toBe(false);
    expect(canViewBus(pr(byRoute), byRoute, { ...bus, routeId: null })).toBe(false);
  });
  it('inactive accounts never pass', () => {
    for (const status of ['PENDING', 'REJECTED', 'DISABLED'] as const) {
      const u = user({ role: 'ADMIN', status });
      expect(canViewBus(pr(u), u, bus)).toBe(false);
    }
  });
  it('refuses a cross-campus bus even if the repository layer were bypassed', () => {
    const u = user({ role: 'STUDENT', assignedBusId: bus.id, campusId: other });
    expect(canViewBus(pr(u), u, bus)).toBe(false);
  });
});

describe('computeFreshness thresholds', () => {
  const now = new Date('2026-10-11T10:00:00Z');
  const trip = { id: 't1' } as TripDTO;
  const loc = (ageMs: number, capAgeMs = ageMs): VehicleLocationDTO => ({
    campusId: campus, busId: bus.id, tripId: 't1', location: { lat: 1, lng: 1 }, accuracyM: null, speedMps: null, speedSource: 'unavailable',
    headingDeg: null, capturedAt: new Date(now.getTime() - capAgeMs), receivedAt: new Date(now.getTime() - ageMs), mode: 'REAL',
  });
  it('boundaries', () => {
    expect(computeFreshness(now, null, trip).state).toBe('UNAVAILABLE');
    expect(computeFreshness(now, loc(0), trip).state).toBe('LIVE');
    expect(computeFreshness(now, loc(20_000), trip).state).toBe('LIVE');
    expect(computeFreshness(now, loc(20_001), trip).state).toBe('STALE');
    expect(computeFreshness(now, loc(120_000), trip).state).toBe('STALE');
    expect(computeFreshness(now, loc(120_001), trip).state).toBe('DRIVER_OFFLINE');
  });
  it('no active trip, or a different trip, is TRIP_ENDED regardless of age', () => {
    expect(computeFreshness(now, loc(0), null).state).toBe('TRIP_ENDED');
    expect(computeFreshness(now, loc(0), { id: 'other' } as TripDTO).state).toBe('TRIP_ENDED');
  });
  it('uses the older of capture and receipt time', () => {
    expect(computeFreshness(now, loc(0, 30_000), trip)).toMatchObject({ state: 'STALE', ageMs: 30_000 });
    expect(computeFreshness(now, loc(10_000, -5_000), trip)).toMatchObject({ ageMs: 10_000 }); // future capture time is clamped
  });
});

describe('haversineMeters', () => {
  it('matches known distances (straight line, not road distance)', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
    expect(haversineMeters({ lat: 28.4595, lng: 77.0266 }, { lat: 28.4596, lng: 77.0266 })).toBeGreaterThan(10);
  });
});

describe('EventRateLimiter', () => {
  it('counts events per key per window', () => {
    let t = 0; const l = new EventRateLimiter(5, 1000, () => t);
    expect(l.tryConsume('a', 3)).toBe(true); expect(l.tryConsume('a', 3)).toBe(false);
    expect(l.tryConsume('b', 5)).toBe(true); expect(l.tryConsume('b', 1)).toBe(false);
    t = 1000; expect(l.tryConsume('a', 5)).toBe(true);
    expect(l.tryConsume('c', 6)).toBe(false);
  });
});
