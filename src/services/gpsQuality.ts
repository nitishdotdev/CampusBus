/**
 * Driver-side GPS quality rules. The server's verdict (liveStatus / liveReason from /api/v1/telemetry) is the only
 * source of truth for what students and admins see. Device accuracy is only used to label a reading that the server
 * already accepted as live but that is less precise than the driver should trust.
 */

/** Device accuracy above this is labelled "low accuracy" on the driver screen. A label only; it does not decide acceptance. */
export const DEVICE_DEGRADED_ACCURACY_M = 65;

export type DeviceAccuracyLevel = 'GOOD' | 'DEGRADED' | 'POOR' | 'UNKNOWN';

/** Accuracy bands: GOOD up to DEGRADED_ACCURACY_M; DEGRADED up to the server's live limit (200 m); POOR beyond that. */
export const SERVER_LIVE_ACCURACY_M = 200;

export function deviceAccuracyLevel(accuracy: number | null | undefined): DeviceAccuracyLevel {
  if (accuracy == null || !Number.isFinite(accuracy)) return 'UNKNOWN';
  if (accuracy <= DEVICE_DEGRADED_ACCURACY_M) return 'GOOD';
  if (accuracy <= SERVER_LIVE_ACCURACY_M) return 'DEGRADED';
  return 'POOR';
}

/** Plain-language reason for each server decision. Unknown codes fall back to a generic line; nothing is invented. */
export const LIVE_REASON_TEXT: Record<string, string> = {
  ACCURACY_ABOVE_LIVE_LIMIT: 'Accuracy is too low to show live (over 200 m). Kept for history only.',
  NOT_FRESH: 'The reading reached the server too late to show live. Kept for history only.',
  TRIP_NOT_ACTIVE: 'This trip is no longer active. Kept for history only.',
  SUPERSEDED_BY_NEWER: 'A newer reading was already shown. This one is kept for history.',
};

export const REJECT_REASON_TEXT: Record<string, string> = {
  FUTURE_TIMESTAMP: 'The phone clock is ahead of the server. Check the phone date and time.',
  EVENT_TOO_OLD: 'The reading is older than 24 hours.',
  BEFORE_TRIP_START: 'The reading was taken before this trip started.',
  AFTER_TRIP_END: 'The reading was taken after this trip ended.',
  INVALID_COORDINATES: 'The coordinates were 0, 0 and were rejected.',
  IMPLAUSIBLE_JUMP: 'The position jumped too far for the elapsed time.',
};

export type ReadingVerdictStatus = 'LIVE' | 'HISTORY_ONLY' | 'REJECTED';

export interface ReadingVerdict {
  status: ReadingVerdictStatus;
  reason?: string;
  accuracy?: number | null;
  timestamp: string;
}

export function verdictText(verdict: ReadingVerdict): { label: string; detail: string; tone: 'ok' | 'warn' | 'error' } {
  const accuracy = deviceAccuracyLevel(verdict.accuracy);
  if (verdict.status === 'LIVE') {
    return accuracy === 'DEGRADED'
      ? { label: 'Live, low accuracy', detail: 'Students see this position, but it is less precise than usual.', tone: 'warn' }
      : { label: 'Live', detail: 'The server accepted this reading and students see it.', tone: 'ok' };
  }
  if (verdict.status === 'HISTORY_ONLY') {
    return { label: 'Not shown live', detail: LIVE_REASON_TEXT[verdict.reason ?? ''] ?? 'Kept for history only.', tone: 'warn' };
  }
  return { label: 'Rejected', detail: REJECT_REASON_TEXT[verdict.reason ?? ''] ?? 'The server rejected this reading.', tone: 'error' };
}

export interface AcceptedFix {
  lat: number;
  lng: number;
  accuracy: number | null | undefined;
  timestamp: string;
}

export interface SyncedReading {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null | undefined;
  timestamp: string;
}

export interface SyncResultLike {
  eventId: string | null;
  status: string;
  liveStatus?: string;
  liveReason?: string;
  reason?: string;
}

export interface VerdictState {
  lastAcceptedLive: AcceptedFix | null;
  lastVerdict: ReadingVerdict | null;
  rejectionCounts: Record<string, number>;
}

/**
 * Folds one sync batch's server results into the driver's verdict state.
 * - A LIVE reading becomes the last accepted live position only if it is newer; unreliable readings never replace it.
 * - Each rejected reading increments its reason code. Duplicates are ignored (their outcome was already recorded).
 * - lastVerdict is the newest reading in the batch by capture time.
 */
export function applySyncVerdicts(prev: VerdictState, results: SyncResultLike[], batch: SyncedReading[]): VerdictState {
  const byId = new Map(batch.map(item => [item.id, item]));
  let next: VerdictState = { ...prev };
  let newest: ReadingVerdict | null = null;

  for (const r of results) {
    const item = r.eventId ? byId.get(r.eventId) : undefined;
    if (!item) continue;
    let status: ReadingVerdictStatus | null = null;
    if (r.status === 'rejected') status = 'REJECTED';
    else if (r.status === 'accepted') status = r.liveStatus === 'LIVE' ? 'LIVE' : 'HISTORY_ONLY';
    if (!status) continue;

    const reason = r.reason ?? r.liveReason;
    if (status === 'REJECTED') {
      const key = reason ?? 'UNKNOWN';
      next = { ...next, rejectionCounts: { ...next.rejectionCounts, [key]: (next.rejectionCounts[key] ?? 0) + 1 } };
    }
    if (status === 'LIVE') {
      const current = next.lastAcceptedLive;
      if (!current || Date.parse(item.timestamp) >= Date.parse(current.timestamp)) {
        next = { ...next, lastAcceptedLive: { lat: item.lat, lng: item.lng, accuracy: item.accuracy, timestamp: item.timestamp } };
      }
    }
    const verdict: ReadingVerdict = { status, reason, accuracy: item.accuracy, timestamp: item.timestamp };
    if (!newest || Date.parse(verdict.timestamp) >= Date.parse(newest.timestamp)) newest = verdict;
  }
  if (newest) next = { ...next, lastVerdict: newest };
  return next;
}
