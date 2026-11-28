import { describe, expect, it } from 'vitest';
import { TelemetryIngestService } from '../src/domain/telemetry/ingest';
import { DEFAULT_TRACKING } from '../src/config/env';
import type { BusDTO, Principal, TripDTO, UserDTO } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const DRIVER = '2'.repeat(24);
const BUS = 'b'.repeat(24);
const TRIP = 'f'.repeat(24);
const NOW = Date.parse('2026-11-28T10:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const principal: Principal = { userId: DRIVER, campusId: CAMPUS, role: 'DRIVER' };

function harness(trip: Partial<TripDTO> = {}, options: { applyIfNewer?: boolean } = {}) {
  const liveWrites: unknown[] = [];
  const driver: UserDTO = { id: DRIVER, campusId: CAMPUS, email: 'd@x.test', name: 'D', role: 'DRIVER', status: 'ACTIVE', emailVerifiedAt: new Date() };
  const bus: BusDTO = { id: BUS, campusId: CAMPUS, number: 'B-1', capacity: 30, status: 'ACTIVE', driverId: DRIVER, routeId: null };
  const activeTrip: TripDTO = {
    id: TRIP, campusId: CAMPUS, busId: BUS, driverId: DRIVER, routeId: 'c'.repeat(24),
    status: 'ACTIVE', mode: 'REAL', startedAt: new Date(NOW - 3_600_000), endedAt: null, ...trip,
  };
  const service = new TelemetryIngestService({
    users: { findById: async () => driver } as any,
    buses: { findById: async () => bus } as any,
    trips: { findById: async () => activeTrip } as any,
    telemetry: { insertIdempotent: async () => 'inserted', findLatestBefore: async () => null } as any,
    live: {
      applyIfNewer: async (loc: unknown) => { liveWrites.push(loc); return { applied: options.applyIfNewer ?? true }; },
    } as any,
    emitter: { emitLocation: () => {} },
    config: DEFAULT_TRACKING,
    now: () => new Date(NOW),
  });
  const run = (events: unknown[]) => service.ingest(principal, { tripId: TRIP, events });
  return { run, liveWrites };
}

const event = (eventId: string, offsetMs: number, accuracyM?: number) => ({
  eventId, lat: 12.97, lng: 77.59, capturedAt: at(offsetMs), ...(accuracyM === undefined ? {} : { accuracyM }),
});

describe('telemetry live verdict', () => {
  it('reports a fresh, accurate reading as LIVE and writes it to the live position', async () => {
    const { run, liveWrites } = harness();
    const { results } = await run([event('evt_live01', -1000, 8)]);
    expect(results[0]).toMatchObject({ status: 'accepted', liveStatus: 'LIVE', appliedToLive: true });
    expect(results[0]!.liveReason).toBeUndefined();
    expect(liveWrites).toHaveLength(1);
  });

  it('reports a reading over the live accuracy limit as history only, with the reason, and does not touch the live position', async () => {
    const { run, liveWrites } = harness();
    const { results } = await run([event('evt_acc001', -1000, 350)]);
    expect(results[0]).toMatchObject({ status: 'accepted', liveStatus: 'HISTORY_ONLY', liveReason: 'ACCURACY_ABOVE_LIVE_LIMIT', appliedToLive: false });
    expect(liveWrites).toHaveLength(0);
  });

  it('reports a reading older than the live window as history only (NOT_FRESH)', async () => {
    const { run } = harness();
    const { results } = await run([event('evt_old001', -60_000, 8)]);
    expect(results[0]).toMatchObject({ liveStatus: 'HISTORY_ONLY', liveReason: 'NOT_FRESH' });
  });

  it('reports a fresh reading that lost to a newer one as SUPERSEDED_BY_NEWER', async () => {
    const { run } = harness({}, { applyIfNewer: false });
    const { results } = await run([event('evt_sup001', -1000, 8)]);
    expect(results[0]).toMatchObject({ liveStatus: 'HISTORY_ONLY', liveReason: 'SUPERSEDED_BY_NEWER' });
  });

  it('reports readings from an ended trip as history only (TRIP_NOT_ACTIVE)', async () => {
    const { run } = harness({ status: 'COMPLETED', endedAt: new Date(NOW - 60_000) });
    const { results } = await run([event('evt_end001', -90_000, 8)]);
    expect(results[0]).toMatchObject({ status: 'accepted', liveStatus: 'HISTORY_ONLY', liveReason: 'TRIP_NOT_ACTIVE' });
  });

  it('rejects a reading whose device clock is ahead, with no live verdict', async () => {
    const { run, liveWrites } = harness();
    const { results } = await run([event('evt_fut001', 3_600_000, 8)]);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'FUTURE_TIMESTAMP' });
    expect(results[0]!.liveStatus).toBeUndefined();
    expect(liveWrites).toHaveLength(0);
  });
});
