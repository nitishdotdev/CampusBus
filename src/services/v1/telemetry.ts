import { v1Client } from './client';

export interface TelemetryEvent {
  eventId: string;
  tripId: string;
  busId: string;
  location: { lat: number; lng: number };
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  capturedAt: string; // ISO
  simulated?: false; // server controls simulation; never send true
}

export interface TelemetryBatch {
  events: TelemetryEvent[];
}

export interface TelemetryResult {
  accepted: number;
  rejected: number;
  errors: { eventId: string; code: string }[];
}

export const telemetryV1 = {
  /** Send a single location update. */
  send: (event: TelemetryEvent) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { events: [event] }),

  /** Send a batch of queued events (offline sync). */
  sendBatch: (events: TelemetryEvent[]) =>
    v1Client.post<TelemetryResult>('/api/v1/telemetry', { events }),
};
