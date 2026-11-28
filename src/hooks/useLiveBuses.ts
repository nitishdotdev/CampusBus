import { useEffect, useState } from 'react';
import { socketV1, type BusLocationPayload } from '../services/v1/socket';
import { newerFix, resolveBusPosition, type SocketFix } from '../services/v1/locationSync';
import type { Bus } from '../types';

const fromPayload = (payload: BusLocationPayload): SocketFix => ({
  lat: payload.location.lat,
  lng: payload.location.lng,
  accuracy: payload.accuracyM ?? undefined,
  speed: payload.speedMps,
  heading: payload.headingDeg,
  timestamp: payload.capturedAt,
  tripId: payload.tripId,
  receivedAt: payload.receivedAt,
  progress: payload.progress,
});

/** Merges the persisted REST position with live socket fixes; see resolveBusPosition for the rules. */
export function useLiveBuses(buses: Bus[]): Bus[] {
  const [socketFixes, setSocketFixes] = useState(new Map<string, SocketFix>());
  const [clock, setClock] = useState(Date.now);
  const subscribed = buses.filter(bus => bus.canTrack && bus.activeTripId).map(bus => bus.id).sort().slice(0, 20).join(',');

  useEffect(() => {
    if (!subscribed) return;
    const unsubscribe = subscribed.split(',').map(id =>
      socketV1.subscribeTobus(id, payload => {
        const fix = fromPayload(payload);
        setClock(Date.now());
        setSocketFixes(previous => {
          const kept = newerFix(previous.get(id), fix);
          return kept === previous.get(id) ? previous : new Map(previous).set(id, kept as SocketFix);
        });
      }),
    );
    return () => unsubscribe.forEach(cancel => cancel());
  }, [subscribed]);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(tick);
  }, []);

  return buses.map(bus => resolveBusPosition(bus, socketFixes.get(bus.id), clock));
}
