import { describe, expect, it } from 'vitest';
import type { QueuedLocationUpdate } from '../src/types';
import {
  createSyncPolicyState, runSyncPass, type SyncPassOptions, type SyncQueue, type SyncTransport,
  type TelemetryEvent, type TelemetryResult,
} from '../src/services/telemetrySyncPass';

const DRIVER = 'driver-a';
const OTHER_DRIVER = 'driver-b';
const T0 = Date.UTC(2026, 10, 28, 10, 0, 0);

const reading = (id: string, tripId: string, offsetS: number, driverId = DRIVER): QueuedLocationUpdate => ({
  id, tripId, busId: 'bus-1', driverId, lat: 12.97, lng: 77.59, accuracy: 8, speed: 5, heading: 90,
  timestamp: new Date(T0 + offsetS * 1000).toISOString(), attemptCount: 0,
});

/** In-memory stand-in for the IndexedDB queue. Matches the contract of offlineQueueService. */
function makeQueue(initial: QueuedLocationUpdate[]) {
  const data = [...initial];
  const quarantined: { tripId: string; reason: string; item: QueuedLocationUpdate }[] = [];
  const byTime = (a: QueuedLocationUpdate, b: QueuedLocationUpdate) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
  const queue: SyncQueue = {
    async getNextBatch(driverId, excluded, limit) {
      return data.filter(item => item.driverId === driverId && !excluded.has(item.tripId)).sort(byTime).slice(0, limit);
    },
    async remove(ids) {
      for (const id of ids) {
        const index = data.findIndex(item => item.id === id);
        if (index >= 0) data.splice(index, 1);
      }
    },
    async quarantineTrip(driverId, tripId, reason) {
      let moved = 0;
      for (let i = data.length - 1; i >= 0; i -= 1) {
        const item = data[i];
        if (item.driverId === driverId && item.tripId === tripId) {
          quarantined.push({ tripId, reason, item });
          data.splice(i, 1);
          moved += 1;
        }
      }
      return moved;
    },
  };
  return { queue, data, quarantined };
}

const accepted = (events: TelemetryEvent[]): TelemetryResult => ({
  tripId: 'x',
  results: events.map(event => ({ eventId: event.eventId, status: 'accepted', liveStatus: 'LIVE' })),
});

/** Scripted transport. `script` decides per call; every call is recorded for assertions. */
function makeTransport(script: (tripId: string, events: TelemetryEvent[], callIndex: number) => TelemetryResult | Promise<TelemetryResult>) {
  const calls: { tripId: string; eventIds: string[] }[] = [];
  const transport: SyncTransport = {
    async sendBatch(tripId, events) {
      const callIndex = calls.length;
      calls.push({ tripId, eventIds: events.map(event => event.eventId) });
      return script(tripId, events, callIndex);
    },
  };
  return { transport, calls };
}

const apiError = (status: number, code?: string, retryAfterMs?: number) => ({ status, code, retryAfterMs, message: code ?? `HTTP ${status}` });

const toEvent = (item: QueuedLocationUpdate): TelemetryEvent => ({
  eventId: item.id, lat: item.lat, lng: item.lng, accuracyM: item.accuracy, capturedAt: item.timestamp,
});

function optionsFor(queue: SyncQueue, transport: SyncTransport, clock: { t: number }, driverId = DRIVER) {
  const state = createSyncPolicyState();
  const options: SyncPassOptions = {
    driverId, queue, transport, state, now: () => clock.t, isCurrent: () => true, toEvent,
  };
  return { options, state };
}

describe('P0-1: one trip must not block other trips', () => {
  it('an expired trip rejected with TRIP_NOT_ACTIVE is quarantined and a later valid trip is still sent', async () => {
    const expired = [reading('e1', 'trip-expired', 0), reading('e2', 'trip-expired', 1)];
    const valid = [reading('v1', 'trip-valid', 10), reading('v2', 'trip-valid', 11)];
    const { queue, data, quarantined } = makeQueue([...expired, ...valid]);
    const { transport, calls } = makeTransport((tripId, events) => {
      if (tripId === 'trip-expired') throw apiError(409, 'TRIP_NOT_ACTIVE');
      return accepted(events);
    });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.quarantinedTrips).toEqual(['trip-expired']);
    expect(outcome.deviceFailure).toBeNull();
    expect(calls.map(c => c.tripId)).toEqual(['trip-expired', 'trip-valid']);
    expect(data).toEqual([]);
    expect(quarantined.map(q => q.item.id).sort()).toEqual(['e1', 'e2']);
  });

  it('a bus reassigned while offline quarantines only that trip, without a device-wide pause', async () => {
    const revoked = [reading('r1', 'trip-revoked', 0)];
    const valid = [reading('v1', 'trip-valid', 10)];
    const { queue, data } = makeQueue([...revoked, ...valid]);
    const { transport } = makeTransport((tripId, events) => {
      if (tripId === 'trip-revoked') throw apiError(403, 'VEHICLE_ASSIGNMENT_REVOKED');
      return accepted(events);
    });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.quarantinedTrips).toEqual(['trip-revoked']);
    expect(state.devicePause).toBeNull();
    expect(data).toEqual([]);
  });

  it('a trip in backoff is not retried in the same pass, and the other trips still send', async () => {
    const flaky = [reading('f1', 'trip-unknown', 0)];
    const valid = [reading('v1', 'trip-valid', 10)];
    const { queue, data } = makeQueue([...flaky, ...valid]);
    const { transport, calls } = makeTransport((tripId, events) => {
      if (tripId === 'trip-unknown') throw apiError(418, 'SOMETHING_NEW');
      return accepted(events);
    });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);

    await runSyncPass(options);

    expect(calls.filter(c => c.tripId === 'trip-unknown')).toHaveLength(1);
    expect(calls.some(c => c.tripId === 'trip-valid')).toBe(true);
    expect(data.map(item => item.id)).toEqual(['f1']);
    expect(state.tripBackoff.has('trip-unknown')).toBe(true);
  });
});

describe('P0-1: temporary failures never destroy valid readings', () => {
  it('a network failure keeps every queued reading and backs the device off without quarantining', async () => {
    const { queue, data, quarantined } = makeQueue([reading('a', 'trip-1', 0), reading('b', 'trip-1', 1)]);
    const { transport, calls } = makeTransport(() => { throw apiError(0, 'NETWORK_ERROR'); });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.deviceFailure?.reason).toBe('NETWORK');
    expect(outcome.deviceFailure?.retryAt).toBeGreaterThan(T0);
    expect(data).toHaveLength(2);
    expect(quarantined).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(state.deviceRetryAt).toBeGreaterThan(T0);
  });

  it('after a timeout the same batch is resent with the same event IDs, and is then removed once accepted', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0), reading('b', 'trip-1', 1)]);
    const { transport, calls } = makeTransport((_tripId, events, callIndex) => {
      if (callIndex === 0) throw apiError(0, 'REQUEST_TIMEOUT');
      return accepted(events);
    });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);

    await runSyncPass(options);
    expect(data).toHaveLength(2);

    clock.t = state.deviceRetryAt + 1;
    await runSyncPass(options);

    expect(calls).toHaveLength(2);
    expect(calls[1].eventIds).toEqual(calls[0].eventIds);
    expect(data).toEqual([]);
  });

  it('a rate-limited request backs off for the server-provided Retry-After and does not quarantine', async () => {
    const { queue, data, quarantined } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport } = makeTransport(() => { throw apiError(429, 'RATE_LIMITED', 90_000); });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.deviceFailure).toEqual({ reason: 'RATE_LIMITED', retryAt: T0 + 90_000 });
    expect(data).toHaveLength(1);
    expect(quarantined).toEqual([]);
  });

  it('a pass that starts during backoff sends nothing until the retry time', async () => {
    const { queue } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport, calls } = makeTransport(() => { throw apiError(0, 'NETWORK_ERROR'); });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);
    await runSyncPass(options);
    const callsBefore = calls.length;

    clock.t = state.deviceRetryAt - 1;
    const early = await runSyncPass(options);
    expect(early.stoppedBy).toBe('BACKOFF');
    expect(calls.length).toBe(callsBefore);
  });
});

describe('authentication and account state', () => {
  it('an authentication failure keeps the queue, stops the pass device-wide, and quarantines nothing', async () => {
    const { queue, data, quarantined } = makeQueue([reading('a', 'trip-1', 0), reading('b', 'trip-2', 10)]);
    const { transport, calls } = makeTransport(() => { throw apiError(401, 'UNAUTHENTICATED'); });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.deviceFailure?.reason).toBe('AUTH');
    expect(calls).toHaveLength(1);
    expect(data).toHaveLength(2);
    expect(quarantined).toEqual([]);
  });

  it('an account restriction pauses the device until sign-in and does not discard any readings', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport, calls } = makeTransport(() => { throw apiError(403, 'ACCOUNT_NOT_ACTIVE'); });
    const clock = { t: T0 };
    const { options, state } = optionsFor(queue, transport, clock);

    const first = await runSyncPass(options);
    expect(first.deviceFailure).toEqual({ reason: 'ACCOUNT', retryAt: null });
    expect(state.devicePause).toBe('ACCOUNT');

    clock.t += 3600_000;
    const second = await runSyncPass(options);
    expect(second.stoppedBy).toBe('PAUSED');
    expect(calls).toHaveLength(1);
    expect(data).toHaveLength(1);
  });
});

describe('isolation and integrity', () => {
  it('never sends another driver\'s readings, even when both drivers share the device queue', async () => {
    const { queue, data } = makeQueue([
      reading('mine', 'trip-mine', 0),
      reading('theirs', 'trip-theirs', 0, OTHER_DRIVER),
    ]);
    const { transport, calls } = makeTransport((_t, events) => accepted(events));
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock, DRIVER);

    await runSyncPass(options);

    expect(calls.map(c => c.eventIds).flat()).toEqual(['mine']);
    expect(data.map(item => item.id)).toEqual(['theirs']);
  });

  it('sends each trip oldest first, so readings are never reordered within a trip', async () => {
    const { queue } = makeQueue([reading('c', 'trip-1', 2), reading('a', 'trip-1', 0), reading('b', 'trip-1', 1)]);
    const { transport, calls } = makeTransport((_t, events) => accepted(events));
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    await runSyncPass(options);

    expect(calls[0].eventIds).toEqual(['a', 'b', 'c']);
  });

  it('removes readings the server reports as duplicates, since they are already stored', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport } = makeTransport((_t, events) => ({
      tripId: 'trip-1', results: events.map(e => ({ eventId: e.eventId, status: 'duplicate' as const })),
    }));
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    await runSyncPass(options);

    expect(data).toEqual([]);
  });

  it('reports server-rejected readings and removes them, rather than retrying them forever', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport, calls } = makeTransport((_t, events) => ({
      tripId: 'trip-1', results: events.map(e => ({ eventId: e.eventId, status: 'rejected' as const, reason: 'FUTURE_TIMESTAMP' })),
    }));
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.serverRejected).toBe(true);
    expect(data).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('does not remove readings the server did not answer for', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0), reading('b', 'trip-1', 1)]);
    const { transport } = makeTransport((_t, events) => ({
      tripId: 'trip-1', results: [{ eventId: events[0].eventId, status: 'accepted' as const, liveStatus: 'LIVE' as const }],
    }));
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    await runSyncPass(options);

    expect(data.map(item => item.id)).toEqual(['b']);
  });

  it('stops immediately if the device has moved to another driver, and does not touch the queue', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-1', 0)]);
    let current = true;
    const { transport, calls } = makeTransport((_t, events) => { current = false; return accepted(events); });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);
    options.isCurrent = () => current;

    const outcome = await runSyncPass(options);

    expect(outcome.stoppedBy).toBe('NOT_CURRENT');
    expect(calls).toHaveLength(1);
    expect(data).toHaveLength(1);
  });
});

describe('bounded retries', () => {
  it('retains readings after repeated unrecognised failures', async () => {
    const { queue, data, quarantined } = makeQueue([reading('a', 'trip-1', 0)]);
    const { transport } = makeTransport(() => { throw apiError(418, 'SOMETHING_NEW'); });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const outcome = await runSyncPass(options);
      expect(outcome.quarantinedTrips).toEqual([]);
      clock.t += 3600_000;
    }
    const last = await runSyncPass(options);

    expect(last.quarantinedTrips).toEqual([]);
    expect(data.map(item => item.id)).toEqual(['a']);
    expect(quarantined).toHaveLength(0);
  });

  it('an invalid request keeps the affected batch and allows another trip to proceed', async () => {
    const { queue, data } = makeQueue([reading('a', 'trip-bad', 0), reading('b', 'trip-good', 5)]);
    const { transport, calls } = makeTransport((tripId, events) => {
      if (tripId === 'trip-bad') throw apiError(400, 'INVALID_REQUEST');
      return accepted(events);
    });
    const clock = { t: T0 };
    const { options } = optionsFor(queue, transport, clock);

    const outcome = await runSyncPass(options);

    expect(outcome.quarantinedTrips).toEqual([]);
    expect(calls.filter(c => c.tripId === 'trip-bad')).toHaveLength(1);
    expect(data.map(item => item.id)).toEqual(['a']);
  });
});
