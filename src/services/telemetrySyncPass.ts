/**
 * One pass of telemetry synchronization, with its dependencies injected:
 * - queue:     the device's pending readings (IndexedDB in production, an in-memory fake in tests).
 * - transport: sends one trip's batch and returns the server's per-event results.
 *
 * Rules enforced here (see telemetrySyncPolicy.ts for the reasoning):
 * - Batches are per trip and oldest first. Readings are never reordered within a trip.
 * - A trip that is backing off is skipped, so it cannot hold back other trips.
 * - A device-wide failure ends the pass. A trip-specific terminal failure quarantines that trip and the pass
 *   continues. Readings are removed from the queue only after the server has answered for them.
 * - The pass never sends for a driver other than the one it was started for.
 */

import type { QueuedLocationUpdate } from '../types';
import {
  actionForFailure, backoffMs, classifyTelemetryFailure, type FailureClass,
} from './telemetrySyncPolicy';

/** Structural shapes of the v1 telemetry contract. Declared here so this module has no runtime or client dependency. */
export interface TelemetryEvent {
  eventId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
  capturedAt: string;
}

export interface TelemetryResult {
  tripId: string;
  results: {
    eventId: string | null;
    status: 'accepted' | 'duplicate' | 'rejected';
    liveStatus?: 'LIVE' | 'HISTORY_ONLY';
    liveReason?: string;
    reason?: string;
  }[];
}

export interface SyncQueue {
  getNextBatch(driverId: string, excludeTripIds: ReadonlySet<string>, limit: number): Promise<QueuedLocationUpdate[]>;
  remove(ids: string[]): Promise<void>;
  quarantineTrip(driverId: string, tripId: string, reason: string): Promise<number>;
}

export interface SyncTransport {
  sendBatch(tripId: string, events: TelemetryEvent[]): Promise<TelemetryResult>;
}

/** Mutable policy state that persists between passes for one driver. */
export interface SyncPolicyState {
  tripBackoff: Map<string, { until: number; attempts: number }>;
  deviceFailures: number;
  deviceRetryAt: number;
  deviceRetryReason: 'AUTH' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER' | null;
  devicePause: 'ACCOUNT' | null;
}

export function createSyncPolicyState(): SyncPolicyState {
  return { tripBackoff: new Map(), deviceFailures: 0, deviceRetryAt: 0, deviceRetryReason: null, devicePause: null };
}

export interface SyncPassOptions {
  driverId: string;
  queue: SyncQueue;
  transport: SyncTransport;
  state: SyncPolicyState;
  now: () => number;
  /** False once the device has moved to another driver. The pass then stops without touching the queue. */
  isCurrent: () => boolean;
  /** Receives each batch's server verdicts, for the driver-visible status. */
  onResults?: (results: TelemetryResult['results'], readings: QueuedLocationUpdate[]) => void;
  toEvent: (item: QueuedLocationUpdate) => TelemetryEvent;
  batchSize?: number;
  maxBatches?: number;
}

export interface SyncPassOutcome {
  batchesSent: number;
  /** Trips whose readings were moved to quarantine during this pass. */
  quarantinedTrips: string[];
  /** The server rejected some readings in this pass (they are not retried). */
  serverRejected: boolean;
  /** A device-wide failure ended the pass. retryAt is null for ACCOUNT, which needs the driver to sign in again. */
  deviceFailure: { reason: 'AUTH' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER' | 'ACCOUNT'; retryAt: number | null } | null;
  stoppedBy: 'EMPTY' | 'BACKOFF' | 'PAUSED' | 'NOT_CURRENT' | 'DEVICE_FAILURE' | 'BATCH_LIMIT';
}

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_MAX_BATCHES = 20;

/** Reads the error fields this module needs from whatever the transport threw. Non-API errors are UNKNOWN. */
function failureOf(error: unknown): { failure: FailureClass; retryAfterMs?: number } {
  if (error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number') {
    const e = error as { status: number; code?: string; retryAfterMs?: number };
    return {
      failure: classifyTelemetryFailure({ status: e.status, code: e.code, retryAfterMs: e.retryAfterMs }),
      retryAfterMs: e.retryAfterMs,
    };
  }
  return { failure: 'UNKNOWN' };
}

export async function runSyncPass(options: SyncPassOptions): Promise<SyncPassOutcome> {
  const { driverId, queue, transport, state, now, isCurrent, onResults, toEvent } = options;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  const outcome: SyncPassOutcome = { batchesSent: 0, quarantinedTrips: [], serverRejected: false, deviceFailure: null, stoppedBy: 'EMPTY' };

  if (state.devicePause) return { ...outcome, stoppedBy: 'PAUSED' };
  if (now() < state.deviceRetryAt) return { ...outcome, stoppedBy: 'BACKOFF' };

  for (let index = 0; index < maxBatches; index += 1) {
    if (!isCurrent()) return { ...outcome, stoppedBy: 'NOT_CURRENT' };

    const current = now();
    const blocked = new Set<string>();
    for (const [tripId, backoff] of state.tripBackoff) if (backoff.until > current) blocked.add(tripId);

    const batch = await queue.getNextBatch(driverId, blocked, batchSize);
    if (!isCurrent()) return { ...outcome, stoppedBy: 'NOT_CURRENT' };
    if (batch.length === 0) return { ...outcome, stoppedBy: 'EMPTY' };

    const tripId = batch[0].tripId;
    const readings = batch.filter(item => item.tripId === tripId);
    try {
      const result = await transport.sendBatch(tripId, readings.map(toEvent));
      if (!isCurrent()) return { ...outcome, stoppedBy: 'NOT_CURRENT' };
      outcome.batchesSent += 1;
      state.deviceFailures = 0;
      state.deviceRetryAt = 0;
      state.deviceRetryReason = null;
      onResults?.(result.results, readings);
      // Remove only what the server answered for. Anything it did not mention stays queued.
      const sent = new Set(readings.map(item => item.id));
      const answered = new Set(result.results.flatMap(item => item.eventId && sent.has(item.eventId) ? [item.eventId] : []));
      await queue.remove(readings.filter(item => answered.has(item.id)).map(item => item.id));
      if (result.results.some(item => item.status === 'rejected')) outcome.serverRejected = true;
      if (answered.size < readings.length) {
        // The server skipped some readings. Back this trip off so they are not re-sent in a tight loop in this pass.
        const attempts = (state.tripBackoff.get(tripId)?.attempts ?? 0) + 1;
        state.tripBackoff.set(tripId, { until: now() + backoffMs(attempts), attempts });
      } else {
        state.tripBackoff.delete(tripId);
      }
    } catch (error) {
      if (!isCurrent()) return { ...outcome, stoppedBy: 'NOT_CURRENT' };
      const { failure, retryAfterMs } = failureOf(error);
      const tripAttempt = (state.tripBackoff.get(tripId)?.attempts ?? 0) + 1;
      const deviceAttempt = state.deviceFailures + 1;
      const action = actionForFailure(failure, failure === 'UNKNOWN' || failure === 'REQUEST_INVALID' ? tripAttempt : deviceAttempt, retryAfterMs);

      if (action.type === 'PAUSE_DEVICE') {
        state.devicePause = action.reason;
        return { ...outcome, deviceFailure: { reason: action.reason, retryAt: null }, stoppedBy: 'DEVICE_FAILURE' };
      }
      if (action.type === 'BACKOFF_DEVICE') {
        state.deviceFailures = deviceAttempt;
        state.deviceRetryAt = now() + action.retryInMs;
        state.deviceRetryReason = action.reason;
        return { ...outcome, deviceFailure: { reason: action.reason, retryAt: state.deviceRetryAt }, stoppedBy: 'DEVICE_FAILURE' };
      }
      if (action.type === 'RETRY_TRIP') {
        state.tripBackoff.set(tripId, { until: current + action.retryInMs, attempts: tripAttempt });
        continue;
      }
      // Permanent for this trip: keep its readings in quarantine for a bounded time and stop sending them.
      if (await queue.quarantineTrip(driverId, tripId, action.reason)) {
        state.tripBackoff.delete(tripId);
        outcome.quarantinedTrips.push(tripId);
      } else {
        state.tripBackoff.set(tripId, { until: now() + backoffMs(tripAttempt), attempts: tripAttempt });
      }
    }
  }
  return { ...outcome, stoppedBy: 'BATCH_LIMIT' };
}
