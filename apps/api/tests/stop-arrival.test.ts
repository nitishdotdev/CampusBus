import { describe, expect, it } from 'vitest';
import { evaluateStop, type StopFix, type StopState } from '../src/domain/telemetry/stopArrival';
import { readStopProgress } from '../src/infra/postgres/stopProgress';

const STOP = { lat: 12.9716, lng: 77.5946 };
const RADIUS = 50;
const T = Date.parse('2026-11-28T10:00:00.000Z');
const fix = (offsetMs: number, extra: Partial<StopFix> = {}): StopFix => ({
  location: STOP, accuracyM: 8, speedMps: 0, capturedAt: new Date(T + offsetMs), ...extra,
});
const pending = (over: Partial<StopState> = {}): StopState => ({ ...STOP, firstFixAt: null, arrivedAt: null, ...over });
const metresNorth = (m: number) => ({ lat: STOP.lat + m / 111_320, lng: STOP.lng });

describe('evaluateStop', () => {
  it('does not mark a bus arrived when it passes through the geofence at speed', () => {
    const d = evaluateStop(pending(), fix(0, { speedMps: 12 }), RADIUS);
    expect(d.arrivedAt).toBeNull();
    expect(d.firstFixAt).toBeNull();
  });

  it('a single stopped fix is only an approach, not an arrival', () => {
    const d = evaluateStop(pending(), fix(0), RADIUS);
    expect(d.arrivedAt).toBeNull();
    expect(d.firstFixAt?.getTime()).toBe(T);
  });

  it('records arrival after two stopped accurate fixes at least MIN_DWELL apart', () => {
    const first = evaluateStop(pending(), fix(0), RADIUS);
    const second = evaluateStop(pending({ firstFixAt: first.firstFixAt }), fix(3000), RADIUS);
    expect(second.arrivedAt?.getTime()).toBe(T + 3000);
    expect(second.changed).toBe(true);
  });

  it('a waiting bus with GPS noise (apparent 3 m/s, 8 m accuracy) still arrives after 6 s, so the stop cannot stall', () => {
    let state = pending();
    let d = evaluateStop(state, fix(0, { speedMps: 3, accuracyM: 8 }), RADIUS);
    state = { ...state, firstFixAt: d.firstFixAt };
    for (const t of [2000, 4000, 6000]) {
      d = evaluateStop(state, fix(t, { speedMps: 3, accuracyM: 8 }), RADIUS);
      state = { ...state, firstFixAt: d.firstFixAt, arrivedAt: d.arrivedAt };
    }
    expect(d.arrivedAt?.getTime()).toBe(T + 6000);
  });

  it('a bus creeping at 3 m/s with poor accuracy (40 m) never arrives', () => {
    const first = evaluateStop(pending(), fix(0, { speedMps: 3, accuracyM: 40 }), RADIUS);
    const later = evaluateStop(pending({ firstFixAt: first.firstFixAt }), fix(10_000, { speedMps: 3, accuracyM: 40 }), RADIUS);
    expect(later.arrivedAt).toBeNull();
  });

  it('a bus rolling at 4 m/s through the geofence never arrives, however long it stays in the radius', () => {
    const first = evaluateStop(pending(), fix(0, { speedMps: 4, accuracyM: 8 }), RADIUS);
    const later = evaluateStop(pending({ firstFixAt: first.firstFixAt }), fix(20_000, { speedMps: 4, accuracyM: 8 }), RADIUS);
    expect(later.arrivedAt).toBeNull();
  });

  it('never infers arrival when speed is unknown, however long the dwell', () => {
    const first = evaluateStop(pending(), fix(0, { speedMps: null }), RADIUS);
    const second = evaluateStop(pending({ firstFixAt: first.firstFixAt }), fix(60_000, { speedMps: null }), RADIUS);
    expect(second.arrivedAt).toBeNull();
  });

  it('ignores fixes that are too inaccurate to decide anything', () => {
    const state = pending({ firstFixAt: new Date(T) });
    const d = evaluateStop(state, fix(3000, { accuracyM: 120 }), RADIUS);
    expect(d).toEqual({ firstFixAt: state.firstFixAt, arrivedAt: null, changed: false });
  });

  it('resets a jittery approach when the bus leaves the geofence', () => {
    const state = pending({ firstFixAt: new Date(T) });
    const outside = { ...fix(2000), location: metresNorth(200) };
    const d = evaluateStop(state, outside, RADIUS);
    expect(d.firstFixAt).toBeNull();
    expect(d.arrivedAt).toBeNull();
    expect(d.changed).toBe(true);
  });

  it('resets the approach when the bus moves again inside the geofence', () => {
    const d = evaluateStop(pending({ firstFixAt: new Date(T) }), fix(2000, { speedMps: 5 }), RADIUS);
    expect(d.firstFixAt).toBeNull();
    expect(d.arrivedAt).toBeNull();
  });

  it('never changes a stop that has already been arrived at', () => {
    const arrived = pending({ firstFixAt: new Date(T), arrivedAt: new Date(T + 2500) });
    expect(evaluateStop(arrived, fix(9000, { speedMps: 9 }), RADIUS)).toEqual({
      firstFixAt: arrived.firstFixAt, arrivedAt: arrived.arrivedAt, changed: false,
    });
  });

  it('a fix far from the stop never produces an arrival', () => {
    const far = { ...fix(0), location: metresNorth(400) };
    const d = evaluateStop(pending({ firstFixAt: new Date(T) }), far, RADIUS);
    expect(d.arrivedAt).toBeNull();
  });
});

describe('readStopProgress', () => {
  const client = (rows: { stop_id: string; arrived_at: Date | null }[]) => ({
    query: async () => ({ rows }),
  }) as any;

  it('returns the next pending stop and the arrived stops in sequence', async () => {
    const progress = await readStopProgress(client([
      { stop_id: 'stop-a', arrived_at: new Date(T) },
      { stop_id: 'stop-b', arrived_at: new Date(T + 1000) },
      { stop_id: 'stop-c', arrived_at: null },
      { stop_id: 'stop-d', arrived_at: null },
    ]), 'trip');
    expect(progress).toEqual({ nextStopId: 'stop-c', completedStopIds: ['stop-a', 'stop-b'] });
  });

  it('reports no next stop once every stop is arrived', async () => {
    const progress = await readStopProgress(client([{ stop_id: 'stop-a', arrived_at: new Date(T) }]), 'trip');
    expect(progress).toEqual({ nextStopId: null, completedStopIds: ['stop-a'] });
  });
});
