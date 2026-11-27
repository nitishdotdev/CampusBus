import { useEffect, useState } from 'react';
import { socketV1, type BusLocationPayload } from '../services/v1/socket';
import type { Bus } from '../types';

export function useLiveBuses(buses: Bus[]): Bus[] {
  const [positions, setPositions] = useState(new Map<string, BusLocationPayload>());
  const [clock, setClock] = useState(Date.now);
  const subscribed = buses.filter(bus => bus.canTrack && bus.activeTripId).map(bus => bus.id).sort().slice(0, 20).join(',');
  useEffect(() => {
    const unsubscribe = subscribed ? subscribed.split(',').map(id =>
      socketV1.subscribeTobus(id, position => {
        setClock(Date.now());
        setPositions(previous => new Map(previous).set(id, position));
      }),
    ) : [];
    const tick = subscribed ? window.setInterval(() => setClock(Date.now()), 5000) : undefined;
    return () => {
      unsubscribe.forEach(cancel => cancel());
      window.clearInterval(tick);
    };
  }, [subscribed]);

  return buses.map(bus => {
    const position = positions.get(bus.id);
    if (!position || !bus.canTrack || position.tripId !== bus.activeTripId) return bus;
    const age = clock - Math.min(Date.parse(position.capturedAt), Date.parse(position.receivedAt));
    if (age > 120_000) return { ...bus, gpsStatus: 'GPS_UNAVAILABLE', trackingStatus: 'DRIVER_OFFLINE' };
    const fresh = age <= 20_000 && position.freshness === 'LIVE';
    return {
      ...bus,
      lastLocation: { ...position.location, timestamp: position.capturedAt, accuracy: position.accuracyM ?? undefined },
      heading: position.headingDeg ?? undefined,
      speedKmh: fresh && position.speedMps != null ? Math.round(position.speedMps * 3.6) : undefined,
      gpsStatus: fresh ? 'GPS_ACTIVE' : 'LOCATION_STALE',
      trackingStatus: fresh ? 'LIVE' : 'STALE',
      networkStatus: fresh ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
      lastSyncTimestamp: position.receivedAt,
    };
  });
}
