import { describe, expect, it } from 'vitest';
import { applySyncVerdicts, deviceAccuracyLevel, verdictText, type VerdictState } from '../src/services/gpsQuality';

const empty: VerdictState = { lastAcceptedLive: null, lastVerdict: null, rejectionCounts: {} };
const reading = (id: string, offsetS: number, accuracy: number | null = 10) => ({
  id, lat: 12.97, lng: 77.59, accuracy, timestamp: new Date(Date.UTC(2026, 10, 28, 10, 0, offsetS)).toISOString(),
});

describe('deviceAccuracyLevel', () => {
  it('uses the driver warning bands and keeps a missing reading unknown rather than assuming it is good', () => {
    expect(deviceAccuracyLevel(10)).toBe('GOOD');
    expect(deviceAccuracyLevel(65)).toBe('GOOD');
    expect(deviceAccuracyLevel(66)).toBe('DEGRADED');
    expect(deviceAccuracyLevel(200)).toBe('DEGRADED');
    expect(deviceAccuracyLevel(201)).toBe('POOR');
    expect(deviceAccuracyLevel(null)).toBe('UNKNOWN');
    expect(deviceAccuracyLevel(Number.NaN)).toBe('UNKNOWN');
  });
});

describe('verdictText', () => {
  it('says a live reading is live, and calls out a live but low-accuracy reading', () => {
    expect(verdictText({ status: 'LIVE', accuracy: 10, timestamp: 'x' }).label).toBe('Live');
    expect(verdictText({ status: 'LIVE', accuracy: 120, timestamp: 'x' }).label).toBe('Live, low accuracy');
  });

  it('explains history-only and rejected readings with the server reason', () => {
    const history = verdictText({ status: 'HISTORY_ONLY', reason: 'ACCURACY_ABOVE_LIVE_LIMIT', accuracy: 350, timestamp: 'x' });
    expect(history.label).toBe('Not shown live');
    expect(history.detail).toMatch(/200 m/);
    const rejected = verdictText({ status: 'REJECTED', reason: 'FUTURE_TIMESTAMP', timestamp: 'x' });
    expect(rejected.label).toBe('Rejected');
    expect(rejected.detail).toMatch(/clock/);
  });

  it('never invents an explanation for an unknown reason code', () => {
    expect(verdictText({ status: 'REJECTED', reason: 'SOMETHING_NEW', timestamp: 'x' }).detail).toBe('The server rejected this reading.');
  });
});

describe('applySyncVerdicts', () => {
  it('keeps the last accepted live position when a later reading is unreliable', () => {
    const batch = [reading('a', 0, 10), reading('b', 3, 350)];
    const results = [
      { eventId: 'a', status: 'accepted', liveStatus: 'LIVE' },
      { eventId: 'b', status: 'accepted', liveStatus: 'HISTORY_ONLY', liveReason: 'ACCURACY_ABOVE_LIVE_LIMIT' },
    ];
    const next = applySyncVerdicts(empty, results, batch);
    expect(next.lastAcceptedLive?.timestamp).toBe(batch[0]!.timestamp);
    expect(next.lastVerdict).toMatchObject({ status: 'HISTORY_ONLY', reason: 'ACCURACY_ABOVE_LIVE_LIMIT' });
  });

  it('counts rejections by reason and ignores duplicates', () => {
    const batch = [reading('a', 0), reading('b', 3), reading('c', 6)];
    const results = [
      { eventId: 'a', status: 'rejected', reason: 'IMPLAUSIBLE_JUMP' },
      { eventId: 'b', status: 'rejected', reason: 'IMPLAUSIBLE_JUMP' },
      { eventId: 'c', status: 'duplicate' },
    ];
    const next = applySyncVerdicts(empty, results, batch);
    expect(next.rejectionCounts).toEqual({ IMPLAUSIBLE_JUMP: 2 });
    expect(next.lastVerdict?.status).toBe('REJECTED');
  });

  it('does not move the accepted position backwards when an older live result arrives later', () => {
    const newer = reading('new', 30, 10);
    const older = reading('old', 5, 10);
    const first = applySyncVerdicts(empty, [{ eventId: 'new', status: 'accepted', liveStatus: 'LIVE' }], [newer]);
    const second = applySyncVerdicts(first, [{ eventId: 'old', status: 'accepted', liveStatus: 'LIVE' }], [older]);
    expect(second.lastAcceptedLive?.timestamp).toBe(newer.timestamp);
  });

  it('ignores results whose reading is not in the batch', () => {
    const next = applySyncVerdicts(empty, [{ eventId: 'ghost', status: 'accepted', liveStatus: 'LIVE' }], []);
    expect(next).toEqual(empty);
  });
});
