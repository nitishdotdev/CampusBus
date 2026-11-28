/**
 * Pure rules for how the driver device reacts when a telemetry batch fails.
 *
 * Scope rule: a failure either affects the whole device (connectivity, rate limit, authentication, account
 * state) or only one trip (the trip ended, the bus was reassigned, the request is malformed for that trip).
 * Device-wide failures pause or back off all sync. Trip-specific terminal failures quarantine that trip's
 * readings so that other trips keep syncing. Nothing here discards data silently: quarantined readings are kept
 * for a bounded period and surfaced to the driver.
 *
 * Classification uses API error codes where the server provides them. HTTP status alone is not enough: for
 * example 403 means different things for ACCOUNT_NOT_ACTIVE and VEHICLE_ASSIGNMENT_REVOKED.
 */

/** Error shape produced by the v1 client (see services/v1/client.ts). */
export interface TelemetryErrorLike {
  status: number;
  code?: string;
  retryAfterMs?: number;
}

export type FailureClass =
  /** No response, or the request timed out. The outcome may be uncertain; the same batch is safe to resend. */
  | 'NETWORK'
  /** 429. The server enforces a per-driver event budget. */
  | 'RATE_LIMITED'
  /** 5xx or 408. Usually server-side and not specific to a trip. */
  | 'SERVER'
  /** 401 after the client's silent refresh already failed. The session needs the driver to sign in again. */
  | 'AUTH'
  /** Account or role no longer allows telemetry. Device-wide and not retried automatically. */
  | 'ACCOUNT'
  /** The trip is no longer active beyond the late-sync window, the bus was reassigned, or the trip is not ours. */
  | 'TRIP_TERMINAL'
  /** 400. The envelope for this trip is invalid, which is a client-side defect for this trip. */
  | 'REQUEST_INVALID'
  /** Anything not recognised. Retried with capped per-trip backoff. */
  | 'UNKNOWN';

export function classifyTelemetryFailure(error: TelemetryErrorLike): FailureClass {
  const { status, code } = error;
  if (status === 0) return 'NETWORK';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status >= 500) return 'SERVER';
  if (status === 401) return 'AUTH';
  if (status === 403) {
    if (code === 'VEHICLE_ASSIGNMENT_REVOKED') return 'TRIP_TERMINAL';
    return 'ACCOUNT';
  }
  if (status === 404 && code === 'TRIP_NOT_FOUND') return 'TRIP_TERMINAL';
  if (status === 409 && code === 'TRIP_NOT_ACTIVE') return 'TRIP_TERMINAL';
  if (status === 400) return 'REQUEST_INVALID';
  return 'UNKNOWN';
}

/** Base and cap for exponential backoff, in milliseconds. */
export const BACKOFF_BASE_MS = 4_000;
export const BACKOFF_CAP_MS = 60_000;
/** Minimum wait after a rate limit when the server gives no Retry-After. */
export const RATE_LIMIT_MIN_MS = 30_000;
/** Upper bound for any server-provided Retry-After, so a bad header cannot stall sync for days. */
export const RETRY_AFTER_CAP_MS = 15 * 60_000;

/** Quarantined readings are kept this long, then pruned. Bounded so location history is not retained indefinitely. */
export const QUARANTINE_RETENTION_MS = 7 * 24 * 3600_000;
/** Maximum quarantined readings kept per browser database. Oldest are pruned first. */
export const QUARANTINE_MAX_PER_DEVICE = 2_000;

/** Exponential backoff: attempt 1 waits BASE, attempt 2 waits 2×BASE, capped. Deterministic by design. */
export function backoffMs(attempt: number): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 10);
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** exponent);
}

export type SyncAction =
  /** Stop all sync for this device until the driver signs in again. Keep the queue intact. */
  | { type: 'PAUSE_DEVICE'; reason: 'ACCOUNT' }
  /** Pause all sync for a while, then retry. The queue stays intact. */
  | { type: 'BACKOFF_DEVICE'; reason: 'NETWORK' | 'RATE_LIMITED' | 'SERVER' | 'AUTH'; retryInMs: number }
  /** Retry this trip later; other trips may proceed now. */
  | { type: 'RETRY_TRIP'; retryInMs: number }
  /** Move this trip's readings into quarantine. Other trips continue. */
  | { type: 'QUARANTINE_TRIP'; reason: FailureClass };

/**
 * @param failure      classification from classifyTelemetryFailure
 * @param attempt      consecutive failures for this trip, including this one (1-based)
 * @param retryAfterMs server-provided Retry-After, if any
 */
export function actionForFailure(failure: FailureClass, attempt: number, retryAfterMs?: number): SyncAction {
  switch (failure) {
    case 'AUTH':
      // The client already tried a silent refresh. Keep the queue and check again later; the driver may sign in.
      return { type: 'BACKOFF_DEVICE', reason: 'AUTH', retryInMs: backoffMs(attempt) };
    case 'ACCOUNT':
      return { type: 'PAUSE_DEVICE', reason: 'ACCOUNT' };
    case 'NETWORK':
      return { type: 'BACKOFF_DEVICE', reason: 'NETWORK', retryInMs: backoffMs(attempt) };
    case 'SERVER':
      return { type: 'BACKOFF_DEVICE', reason: 'SERVER', retryInMs: backoffMs(attempt) };
    case 'RATE_LIMITED': {
      const wanted = retryAfterMs ?? Math.max(RATE_LIMIT_MIN_MS, backoffMs(attempt));
      return { type: 'BACKOFF_DEVICE', reason: 'RATE_LIMITED', retryInMs: Math.min(wanted, RETRY_AFTER_CAP_MS) };
    }
    case 'TRIP_TERMINAL':
      return { type: 'QUARANTINE_TRIP', reason: failure };
    case 'REQUEST_INVALID':
    case 'UNKNOWN':
      return { type: 'RETRY_TRIP', retryInMs: backoffMs(attempt) };
  }
}

/** Human-readable driver-facing status for a failure. Never claims data was lost or delivered when it was not. */
export function describeSyncPause(reason: 'AUTH' | 'ACCOUNT' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER'): string {
  switch (reason) {
    case 'NETWORK': return 'No connection. Location readings are saved on this device and will be sent when the connection returns.';
    case 'RATE_LIMITED': return 'Location updates are being sent too quickly. They are saved and will be sent shortly.';
    case 'SERVER': return 'The campus server is not responding correctly. Location readings are saved and will be retried.';
    case 'AUTH': return 'Your session needs to be renewed. Sign in again so saved location readings can be sent.';
    case 'ACCOUNT': return 'Your driver account cannot send location updates right now. Contact campus transport.';
  }
}
