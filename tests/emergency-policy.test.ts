import { describe, expect, it } from 'vitest';
import {
  ALERT_SENT_WAITING, canStartEmergencySubmission, emergencyCopy, failureMessageForCreate,
  reconcileUncertainEmergency, shouldRetryWithoutTrip, stateFromAlertRecord,
  type AlertRecordLike, type EmergencyAttempt,
} from '../src/services/emergencyPolicy';

const ME = 'driver-me';
const OTHER = 'driver-other';
const BUS = 'bus-1';
const MSG = 'Mechanical breakdown / safe curb stop';

const alert = (over: Partial<AlertRecordLike> & { id: string }): AlertRecordLike => ({
  busId: BUS, raisedBy: ME, message: MSG, status: 'OPEN',
  createdAt: '2026-11-28T10:00:00.000Z', acknowledgedAt: null, resolvedAt: null, ...over,
});

const attempt = (): EmergencyAttempt => ({ requestId: 'new-1', busId: BUS, message: MSG });

describe('creation', () => {
  it('a successful create is shown as waiting for acknowledgement, using the agreed wording', () => {
    const state = stateFromAlertRecord(alert({ id: 'a1', status: 'OPEN' }));
    expect(state.status).toBe('OPEN');
    expect(emergencyCopy(state)?.title).toBe(ALERT_SENT_WAITING);
    expect(ALERT_SENT_WAITING).toBe('Emergency alert sent. Waiting for campus operations to acknowledge.');
  });

  it('never claims acknowledgement for an OPEN alert, even when a stale timestamp is present', () => {
    const state = stateFromAlertRecord(alert({ id: 'a1', status: 'OPEN', acknowledgedAt: '2026-11-28T10:01:00.000Z' }));
    const copy = emergencyCopy(state);
    expect(copy?.title).not.toMatch(/acknowledged/i);
    expect(copy?.title).toBe(ALERT_SENT_WAITING);
  });
});

describe('acknowledgement and resolution', () => {
  it('shows acknowledgement only when the server reports ACKNOWLEDGED', () => {
    const copy = emergencyCopy(stateFromAlertRecord(alert({ id: 'a1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-11-28T10:02:00.000Z' })));
    expect(copy?.tone).toBe('success');
    expect(copy?.title).toBe('Acknowledged by campus operations.');
  });

  it('does not invent an acknowledgement time when the server gave none', () => {
    const copy = emergencyCopy(stateFromAlertRecord(alert({ id: 'a1', status: 'ACKNOWLEDGED', acknowledgedAt: null })));
    expect(copy?.detail).toBe('Campus operations has seen this alert.');
    expect(copy?.detail).not.toMatch(/at \d/);
  });

  it('shows resolution as its own state, without an acknowledgement claim', () => {
    const copy = emergencyCopy(stateFromAlertRecord(alert({ id: 'a1', status: 'RESOLVED', resolvedAt: null })));
    expect(copy?.title).toBe('Resolved by campus operations.');
    expect(copy?.title).not.toMatch(/acknowledged/i);
  });
});

describe('failure', () => {
  it('a server rejection says the alert was not sent and does not claim anything was created', () => {
    const copy = emergencyCopy({ kind: 'FAILED', message: failureMessageForCreate({ status: 500 }, '+91 11 0000 0000') });
    expect(copy?.title).toBe('The alert was not sent.');
    expect(copy?.detail).toContain('+91 11 0000 0000');
  });

  it('a forbidden response gives a permission message rather than a generic failure', () => {
    expect(failureMessageForCreate({ status: 403 })).toMatch(/not allowed/);
  });
});

describe('uncertain submission', () => {
  it('a timeout is shown as unconfirmed, never as sent or as rejected', () => {
    const copy = emergencyCopy({ kind: 'UNCERTAIN', attempt: attempt() }, '+91 11 0000 0000');
    expect(copy?.tone).toBe('warning');
    expect(copy?.title).toBe('We could not confirm that the alert was sent.');
    expect(copy?.title).not.toBe(ALERT_SENT_WAITING);
    expect(copy?.title).toMatch(/could not confirm/);
    expect(copy?.detail).toContain('+91 11 0000 0000');
  });

  it('finds the alert the server created during an uncertain submission', () => {
    const result = reconcileUncertainEmergency(attempt(), alert({ id: 'new-1' }), ME);
    expect(result.kind).toBe('FOUND');
    if (result.kind === 'FOUND') expect(result.state).toMatchObject({ alertId: 'new-1', status: 'OPEN' });
  });

  it('reports not found when the server has no matching new alert, so the driver can retry deliberately', () => {
    const result = reconcileUncertainEmergency(attempt(), alert({ id: 'old-1' }), ME);
    expect(result).toEqual({ kind: 'NOT_FOUND' });
  });

  it('ignores other drivers\' alerts even when the bus and message match', () => {
    const result = reconcileUncertainEmergency(attempt(), alert({ id: 'new-1', raisedBy: OTHER }), ME);
    expect(result).toEqual({ kind: 'NOT_FOUND' });
  });

  it('rejects stale identical alerts with a different request ID', () => {
    const olderAlert = alert({ id: 'older-identical' });
    expect(reconcileUncertainEmergency(attempt(), olderAlert, ME)).toEqual({ kind: 'NOT_FOUND' });
  });

  it('reflects the server status of the matched alert, including acknowledgement made before reconciliation', () => {
    const result = reconcileUncertainEmergency(attempt(), alert({ id: 'new-1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-11-28T10:00:30.000Z' }), ME);
    expect(result.kind === 'FOUND' && result.state.status).toBe('ACKNOWLEDGED');
  });
});

describe('submission guards and retries', () => {
  it('in-flight and uncertain submissions block a new request ID', () => {
    expect(canStartEmergencySubmission({ kind: 'SUBMITTING' })).toBe(false);
    expect(canStartEmergencySubmission({ kind: 'IDLE' })).toBe(true);
    expect(canStartEmergencySubmission({ kind: 'FAILED', message: 'x' })).toBe(true);
    expect(canStartEmergencySubmission({ kind: 'UNCERTAIN', attempt: attempt() })).toBe(false);
  });

  it('retries once without the trip when the trip ended before the alert arrived', () => {
    expect(shouldRetryWithoutTrip({ status: 404, code: 'TRIP_NOT_FOUND' }, true)).toBe(true);
  });

  it('does not retry without the trip when no trip was referenced, to avoid looping', () => {
    expect(shouldRetryWithoutTrip({ status: 404, code: 'TRIP_NOT_FOUND' }, false)).toBe(false);
  });

  it('does not retry for other errors', () => {
    expect(shouldRetryWithoutTrip({ status: 403, code: 'FORBIDDEN' }, true)).toBe(false);
  });
});
