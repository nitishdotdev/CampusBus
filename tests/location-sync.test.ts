import { describe, expect, it } from 'vitest';
import { newerFix, resolveBusPosition, type SocketFix } from '../src/services/v1/locationSync';
import type { Bus } from '../src/types';

const T0 = Date.parse('2026-11-28T10:00:00.000Z');
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

function bus(overrides: Partial<Bus> = {}): Bus {
  return {
    id: 'bus1', collegeId: 'c1', busNumber: 'B-1', plateNumber: '', model: '', capacity: 30, currentOccupancy: 0,
    hasOccupancy: false, status: 'ACTIVE', gpsStatus: 'GPS_UNAVAILABLE', networkStatus: 'NETWORK_OFFLINE',
    etaConfidence: 'OFFLINE', lastSyncTimestamp: '', canTrack: true, activeTripId: 'trip1',
    ...overrides,
  } as Bus;
}

function fix(offsetMs: number, lat: number, extra: Partial<SocketFix> = {}): SocketFix {
  return { lat, lng: 77.5, timestamp: iso(offsetMs), tripId: 'trip1', receivedAt: iso(offsetMs + 500), ...extra };
}

const restLoc = (offsetMs: number, lat: number, heading: number | null = 90) => ({
  lat, lng: 77.5, timestamp: iso(offsetMs), accuracy: 12, speed: 4, heading, receivedAt: iso(offsetMs + 500),
});

describe('newerFix ordering', () => {
  it('keeps the fix with the later capture time, however it arrives', () => {
    const arrivals = [fix(3000, 1), fix(1000, 2), fix(2000, 3)];
    const kept = arrivals.reduce<SocketFix | undefined>((acc, next) => newerFix(acc, next), undefined);
    expect(kept?.lat).toBe(1);
  });

  it('does not let an older REST snapshot overwrite a newer socket fix', () => {
    const socket = fix(5000, 10);
    const olderRest = restLoc(2000, 99);
    expect(newerFix<{ timestamp: string }>(socket, olderRest)).toBe(socket);
  });

  it('ties go to the incoming event, and an unparseable timestamp never wins', () => {
    const a = fix(1000, 1);
    const b = fix(1000, 2);
    expect(newerFix(a, b)).toBe(b);
    expect(newerFix({ timestamp: 'not-a-date' }, { timestamp: iso(0) })).toEqual({ timestamp: iso(0) });
  });
});

describe('resolveBusPosition', () => {
  const now = T0 + 5000;

  it('prefers a newer REST snapshot over an older socket fix', () => {
    const b = bus({ lastLocation: restLoc(4000, 20), lastSyncTimestamp: iso(4500) });
    const resolved = resolveBusPosition(b, fix(1000, 10), now);
    expect(resolved.lastLocation?.lat).toBe(20);
  });

  it('keeps a newer socket fix when a REST refresh carries an older capture', () => {
    const b = bus({ lastLocation: restLoc(1000, 10), lastSyncTimestamp: iso(1500) });
    const resolved = resolveBusPosition(b, fix(4000, 30), now);
    expect(resolved.lastLocation?.lat).toBe(30);
    expect(resolved.lastSyncTimestamp).toBe(iso(4500));
  });

  it('ignores a socket fix that belongs to a previous trip', () => {
    const b = bus({ lastLocation: restLoc(1000, 10), lastSyncTimestamp: iso(1500) });
    const resolved = resolveBusPosition(b, fix(4000, 30, { tripId: 'old-trip' }), now);
    expect(resolved.lastLocation?.lat).toBe(10);
  });

  it('ignores socket fixes for a bus the caller may not track', () => {
    const resolved = resolveBusPosition(bus({ canTrack: false }), fix(4000, 30), now);
    expect(resolved.lastLocation).toBeUndefined();
  });

  it('never invents a heading: a missing heading stays undefined', () => {
    const b = bus({ lastLocation: restLoc(4000, 20, null), lastSyncTimestamp: iso(4500) });
    expect(resolveBusPosition(b, undefined, now).heading).toBeUndefined();
    expect(resolveBusPosition(bus(), fix(4000, 10, { heading: null }), now).heading).toBeUndefined();
  });

  it('returns a bus with no position unchanged rather than generating coordinates', () => {
    const b = bus();
    expect(resolveBusPosition(b, undefined, now)).toBe(b);
  });

  it('marks a recent fix LIVE and reports speed', () => {
    const b = bus({ lastLocation: restLoc(4000, 20), lastSyncTimestamp: iso(4500) });
    const resolved = resolveBusPosition(b, undefined, T0 + 10_000);
    expect(resolved.trackingStatus).toBe('LIVE');
    expect(resolved.speedKmh).toBe(14);
  });

  it('marks a fix older than 20 s STALE and one older than 120 s DRIVER_OFFLINE, keeping the last known position', () => {
    const b = bus({ lastLocation: restLoc(0, 20), lastSyncTimestamp: iso(500) });
    const stale = resolveBusPosition(b, undefined, T0 + 30_000);
    expect(stale.trackingStatus).toBe('STALE');
    const offline = resolveBusPosition(b, undefined, T0 + 130_000);
    expect(offline.trackingStatus).toBe('DRIVER_OFFLINE');
    expect(offline.lastLocation?.lat).toBe(20);
    expect(offline.speedKmh).toBeUndefined();
  });

  it('a socket reconnect snapshot with an older capture does not move the bus back (store rule)', () => {
    // The socket store keeps the newest fix per bus; a reconnect snapshot older than it is discarded.
    const store = newerFix<SocketFix>(fix(6000, 50), fix(3000, 40));
    const resolved = resolveBusPosition(bus({ lastLocation: restLoc(1000, 10), lastSyncTimestamp: iso(1500) }), store, now);
    expect(resolved.lastLocation?.lat).toBe(50);
  });

  it('takes stop progression from the same live fix as the position', () => {
    const b = bus({ lastLocation: restLoc(1000, 10), lastSyncTimestamp: iso(1500), nextStopId: 'stop-a', completedStopIds: [] });
    const resolved = resolveBusPosition(b, fix(4000, 30, { progress: { nextStopId: 'stop-b', completedStopIds: ['stop-a'] } }), now);
    expect(resolved.nextStopId).toBe('stop-b');
    expect(resolved.completedStopIds).toEqual(['stop-a']);
  });

  it('keeps the REST stop progression when a live fix carries none', () => {
    const b = bus({ lastLocation: restLoc(1000, 10), lastSyncTimestamp: iso(1500), nextStopId: 'stop-a', completedStopIds: [] });
    const resolved = resolveBusPosition(b, fix(4000, 30), now);
    expect(resolved.nextStopId).toBe('stop-a');
  });
});
