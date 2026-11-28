import { v1Client } from './client';

export interface TelemetryEvent {
  eventId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
  capturedAt: string;
}

export type LiveReason = 'TRIP_NOT_ACTIVE' | 'ACCURACY_ABOVE_LIVE_LIMIT' | 'NOT_FRESH' | 'SUPERSEDED_BY_NEWER';

export interface TelemetryResult {
  tripId: string;
  results: {
    eventId: string | null;
    status: 'accepted' | 'duplicate' | 'rejected';
    /** Server's authoritative verdict for accepted readings: shown live to students and admins, or stored for history only. */
    liveStatus?: 'LIVE' | 'HISTORY_ONLY';
    liveReason?: LiveReason;
    reason?: string;
  }[];
}

export const telemetryV1 = {
  send: (tripId: string, event: TelemetryEvent) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { tripId, events: [event] }),

  sendBatch: (tripId: string, events: TelemetryEvent[]) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { tripId, events }),
};
