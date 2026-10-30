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

export interface TelemetryResult {
  tripId: string;
  results: { eventId: string | null; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }[];
}

export const telemetryV1 = {
  send: (tripId: string, event: TelemetryEvent) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { tripId, events: [event] }),

  sendBatch: (tripId: string, events: TelemetryEvent[]) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { tripId, events }),
};
