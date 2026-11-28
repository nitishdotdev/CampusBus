import { describe, expect, it } from 'vitest';
import {
  BACKOFF_CAP_MS, RATE_LIMIT_MIN_MS, RETRY_AFTER_CAP_MS,
  actionForFailure, backoffMs, classifyTelemetryFailure,
} from '../src/services/telemetrySyncPolicy';

describe('classifyTelemetryFailure', () => {
  it('classifies by API code where the server provides one, not by status alone', () => {
    expect(classifyTelemetryFailure({ status: 409, code: 'TRIP_NOT_ACTIVE' })).toBe('TRIP_TERMINAL');
    expect(classifyTelemetryFailure({ status: 403, code: 'VEHICLE_ASSIGNMENT_REVOKED' })).toBe('TRIP_TERMINAL');
    expect(classifyTelemetryFailure({ status: 404, code: 'TRIP_NOT_FOUND' })).toBe('TRIP_TERMINAL');
    // The same 403 status with a different code is an account problem, not a trip problem.
    expect(classifyTelemetryFailure({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' })).toBe('ACCOUNT');
    expect(classifyTelemetryFailure({ status: 403, code: 'DRIVER_ROLE_REQUIRED' })).toBe('ACCOUNT');
  });

  it('treats no response and timeouts as network outcomes (the batch may or may not have been stored)', () => {
    expect(classifyTelemetryFailure({ status: 0, code: 'NETWORK_ERROR' })).toBe('NETWORK');
    expect(classifyTelemetryFailure({ status: 0, code: 'REQUEST_TIMEOUT' })).toBe('NETWORK');
  });

  it('classifies rate limits, server errors, authentication and malformed requests', () => {
    expect(classifyTelemetryFailure({ status: 429, code: 'RATE_LIMITED' })).toBe('RATE_LIMITED');
    expect(classifyTelemetryFailure({ status: 503 })).toBe('SERVER');
    expect(classifyTelemetryFailure({ status: 500, code: 'INTERNAL_ERROR' })).toBe('SERVER');
    expect(classifyTelemetryFailure({ status: 401, code: 'UNAUTHENTICATED' })).toBe('AUTH');
    expect(classifyTelemetryFailure({ status: 401, code: 'SESSION_REVOKED' })).toBe('AUTH');
    expect(classifyTelemetryFailure({ status: 400, code: 'INVALID_REQUEST' })).toBe('REQUEST_INVALID');
  });

  it('keeps unrecognised codes as UNKNOWN rather than guessing', () => {
    expect(classifyTelemetryFailure({ status: 418, code: 'SOMETHING_NEW' })).toBe('UNKNOWN');
  });
});

describe('actionForFailure: one bad trip must not block other trips', () => {
  it('quarantines only the affected trip when it has expired beyond the late-sync window', () => {
    const action = actionForFailure(classifyTelemetryFailure({ status: 409, code: 'TRIP_NOT_ACTIVE' }), 1);
    expect(action).toEqual({ type: 'QUARANTINE_TRIP', reason: 'TRIP_TERMINAL' });
  });

  it('quarantines the trip when the bus was reassigned, without a device-wide pause', () => {
    const action = actionForFailure(classifyTelemetryFailure({ status: 403, code: 'VEHICLE_ASSIGNMENT_REVOKED' }), 1);
    expect(action.type).toBe('QUARANTINE_TRIP');
  });

  it('a temporary network failure backs off the device and never quarantines or discards readings', () => {
    const action = actionForFailure(classifyTelemetryFailure({ status: 0, code: 'NETWORK_ERROR' }), 1);
    expect(action).toEqual({ type: 'BACKOFF_DEVICE', reason: 'NETWORK', retryInMs: backoffMs(1) });
    expect(action.type).not.toBe('QUARANTINE_TRIP');
  });

  it('preserves unrecognised or invalid batches and caps their backoff', () => {
    expect(actionForFailure('UNKNOWN', 40)).toEqual({ type: 'RETRY_TRIP', retryInMs: BACKOFF_CAP_MS });
    expect(actionForFailure('REQUEST_INVALID', 40)).toEqual({ type: 'RETRY_TRIP', retryInMs: BACKOFF_CAP_MS });
  });
});

describe('actionForFailure: rate limits and authentication', () => {
  it('a rate-limited request backs off by at least the minimum when the server gives no Retry-After', () => {
    const action = actionForFailure('RATE_LIMITED', 1);
    expect(action).toEqual({ type: 'BACKOFF_DEVICE', reason: 'RATE_LIMITED', retryInMs: RATE_LIMIT_MIN_MS });
  });

  it('honours a server Retry-After when it is given', () => {
    expect(actionForFailure('RATE_LIMITED', 1, 90_000)).toEqual({ type: 'BACKOFF_DEVICE', reason: 'RATE_LIMITED', retryInMs: 90_000 });
  });

  it('caps an excessive Retry-After so a bad header cannot stall sync for days', () => {
    const action = actionForFailure('RATE_LIMITED', 1, 10 * 24 * 3600_000);
    expect(action.type === 'BACKOFF_DEVICE' && action.retryInMs).toBe(RETRY_AFTER_CAP_MS);
  });

  it('an authentication failure keeps the queue and retries later without quarantining anything', () => {
    const action = actionForFailure('AUTH', 1);
    expect(action.type).toBe('BACKOFF_DEVICE');
    expect(action.type === 'BACKOFF_DEVICE' && action.reason).toBe('AUTH');
  });

  it('an account restriction pauses the device rather than quarantining trip data', () => {
    expect(actionForFailure('ACCOUNT', 1)).toEqual({ type: 'PAUSE_DEVICE', reason: 'ACCOUNT' });
  });
});

describe('backoffMs', () => {
  it('grows exponentially and is capped', () => {
    expect(backoffMs(1)).toBe(4_000);
    expect(backoffMs(2)).toBe(8_000);
    expect(backoffMs(3)).toBe(16_000);
    expect(backoffMs(50)).toBe(BACKOFF_CAP_MS);
  });

  it('treats a non-positive attempt count as the first attempt', () => {
    expect(backoffMs(0)).toBe(backoffMs(1));
  });
});
