/**
 * Emergency alert state for the driver. Vocabulary is the server's (apps/api AlertStatus, CONTEXT.md):
 * OPEN -> ACKNOWLEDGED -> RESOLVED. A successful create is always OPEN. Nothing in this module can show an
 * acknowledgement without a server-reported ACKNOWLEDGED or RESOLVED status.
 *
 * States the driver can be in:
 * - IDLE:       no alert in progress from this screen.
 * - SUBMITTING: request in flight. Blocks a second submission from this screen.
 * - SENT:       server created the alert. Shows the server's status (OPEN, ACKNOWLEDGED, RESOLVED).
 * - FAILED:     server answered with an error. Nothing was created. Safe to try again.
 * - UNCERTAIN:  no response or timeout. The alert may exist. Reconcile with the server before saying anything.
 */

export type EmergencyAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface EmergencyAttempt {
  requestId: string;
  busId: string;
  tripId?: string;
  message: string;
  location?: { lat: number; lng: number };
}

export type EmergencyState =
  | { kind: 'IDLE' }
  | { kind: 'SUBMITTING' }
  | { kind: 'SENT'; alertId: string; status: EmergencyAlertStatus; acknowledgedAt: string | null; resolvedAt: string | null }
  | { kind: 'FAILED'; message: string }
  | { kind: 'UNCERTAIN'; attempt: EmergencyAttempt };

export const ALERT_SENT_WAITING = 'Emergency alert sent. Waiting for campus operations to acknowledge.';

/** Whether a new submission may start from this state. An uncertain submission can be retried with the same request ID. */
export function canStartEmergencySubmission(state: EmergencyState): boolean {
  return state.kind !== 'SUBMITTING' && state.kind !== 'UNCERTAIN';
}

export interface EmergencyCopy {
  tone: 'info' | 'success' | 'error' | 'warning';
  title: string;
  detail: string;
}

/** Driver-facing copy for each state. Returns null when nothing should be shown. */
export function emergencyCopy(state: EmergencyState, dispatchPhone?: string | null): EmergencyCopy | null {
  switch (state.kind) {
    case 'IDLE':
    case 'SUBMITTING':
      return null;
    case 'SENT':
      if (state.status === 'OPEN') {
        return { tone: 'info', title: ALERT_SENT_WAITING, detail: 'Keep following your trip instructions until dispatch responds.' };
      }
      if (state.status === 'ACKNOWLEDGED') {
        // The acknowledgement time is shown only when the server provided it.
        return {
          tone: 'success',
          title: 'Acknowledged by campus operations.',
          detail: state.acknowledgedAt ? `Acknowledged at ${formatTime(state.acknowledgedAt)}.` : 'Campus operations has seen this alert.',
        };
      }
      return {
        tone: 'success',
        title: 'Resolved by campus operations.',
        detail: state.resolvedAt ? `Resolved at ${formatTime(state.resolvedAt)}.` : 'Campus operations has closed this alert.',
      };
    case 'FAILED':
      return { tone: 'error', title: 'The alert was not sent.', detail: state.message };
    case 'UNCERTAIN':
      return {
        tone: 'warning',
        title: 'We could not confirm that the alert was sent.',
        detail: dispatchPhone
          ? `Checking with the server. If you need immediate help, call campus dispatch at ${dispatchPhone}.`
          : 'Checking with the server. If you need immediate help, call campus dispatch by phone.',
      };
  }
}

function formatTime(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 'an unknown time' : new Date(parsed).toLocaleTimeString();
}

/** Minimal alert record needed for reconciliation (a subset of the v1 alert DTO). */
export interface AlertRecordLike {
  id: string;
  busId: string;
  raisedBy: string;
  message?: string | null;
  status: EmergencyAlertStatus;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
}

export type ReconcileResult =
  | { kind: 'FOUND'; state: Extract<EmergencyState, { kind: 'SENT' }> }
  | { kind: 'NOT_FOUND' };

export function reconcileUncertainEmergency(attempt: EmergencyAttempt, alert: AlertRecordLike, driverId: string): ReconcileResult {
  return alert.id === attempt.requestId && alert.raisedBy === driverId
    ? { kind: 'FOUND', state: stateFromAlertRecord(alert) }
    : { kind: 'NOT_FOUND' };
}

export function stateFromAlertRecord(alert: AlertRecordLike): Extract<EmergencyState, { kind: 'SENT' }> {
  return {
    kind: 'SENT',
    alertId: alert.id,
    status: alert.status,
    acknowledgedAt: alert.acknowledgedAt ?? null,
    resolvedAt: alert.resolvedAt ?? null,
  };
}

/**
 * Whether a failed create should be retried once without the trip reference. The server returns TRIP_NOT_FOUND when
 * the trip ended between the driver tapping and the request arriving. A bus-level alert is still valid.
 */
export function shouldRetryWithoutTrip(error: { status: number; code?: string }, tripIdWasSent: boolean): boolean {
  return tripIdWasSent && error.status === 404 && error.code === 'TRIP_NOT_FOUND';
}

/** Driver-facing text for a definitive server rejection. Does not claim the alert was delivered. */
export function failureMessageForCreate(error: { status: number; code?: string }, dispatchPhone?: string | null): string {
  const phone = dispatchPhone
    ? `Call campus dispatch at ${dispatchPhone} if you need immediate help.`
    : 'Call campus dispatch by phone if you need immediate help.';
  if (error.status === 403) return `You are not allowed to send an alert for this bus right now. ${phone}`;
  if (error.status === 404) return `This bus or trip could not be found. ${phone}`;
  return `The server could not record the alert. ${phone}`;
}
