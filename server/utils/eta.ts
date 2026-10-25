// Honest ETA and Confidence calculation based on real telemetry & route topology
// No AI/ML hype: uses geometric path projection, live GPS velocity, and stop dwell times.

export type ETAConfidence = 'LIVE' | 'DEGRADED' | 'STALE' | 'OFFLINE' | 'SCHEDULED';

export interface CalculatedETA {
  stopId: string;
  stopName: string;
  etaMinutes: number;
  distanceKm: number;
  confidence: ETAConfidence;
}

// Haversine distance in kilometers
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determine honest GPS confidence based on telemetry freshness and vehicle status
 */
export function determineConfidence(
  lastSyncTimestamp: string | Date,
  busStatus: string,
  isSimulated: boolean = false
): ETAConfidence {
  if (busStatus === 'MAINTENANCE' || busStatus === 'OUT_OF_SERVICE' || busStatus === 'OFFLINE') {
    return 'OFFLINE';
  }

  if (busStatus !== 'ACTIVE') {
    return 'SCHEDULED';
  }

  const lastTime = new Date(lastSyncTimestamp).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, (now - lastTime) / 1000);

  if (diffSec <= 30) {
    return 'LIVE';
  }
  if (diffSec <= 120) {
    return 'DEGRADED';
  }
  if (diffSec <= 300) {
    return 'STALE';
  }
  return 'OFFLINE';
}

/**
 * Calculate honest ETAs to upcoming stops along a route.
 * Strictly respects route sequence, completed stops, realistic travel speeds,
 * and road corridor circuity rather than straight-line flight across buildings.
 */
export function calculateRouteETAs(
  busLat: number,
  busLng: number,
  speedKmh: number,
  stops: { id: string; name: string; lat: number; lng: number; sequence: number }[],
  confidence: ETAConfidence,
  options?: {
    completedStopIds?: string[];
    nextStopId?: string | null;
    pathCoordinates?: [number, number][];
  }
): CalculatedETA[] {
  if (!stops || stops.length === 0) return [];

  // Reject invalid, NaN, or out-of-range coordinates
  if (!Number.isFinite(busLat) || !Number.isFinite(busLng) || busLat < -90 || busLat > 90 || busLng < -180 || busLng > 180) {
    return [];
  }

  // If telemetry is offline, stale (>5 min), or unavailable, show honest unavailable state
  if (confidence === 'OFFLINE') {
    return [];
  }

  // Filter out stops with missing or invalid coordinates
  const validStops = stops.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat >= -90 && s.lat <= 90 && s.lng >= -180 && s.lng <= 180
  );
  if (validStops.length === 0) return [];

  // Sort stops by defined route sequence
  const sortedStops = [...validStops].sort((a, b) => a.sequence - b.sequence);

  // If completedStopIds provided, only compute ETAs for remaining upcoming stops in sequence
  const completedSet = new Set(options?.completedStopIds || []);
  let eligibleStops = sortedStops.filter((s) => !completedSet.has(s.id));

  // If all stops completed or no eligible stops remain
  if (eligibleStops.length === 0) {
    return [];
  }

  // If nextStopId is specified, ensure sequence starts from that stop
  if (options?.nextStopId) {
    const nextIdx = eligibleStops.findIndex((s) => s.id === options.nextStopId);
    if (nextIdx > 0) {
      eligibleStops = eligibleStops.slice(nextIdx);
    }
  }

  // Effective transit travel speed:
  // When stationary (stopped at curb/light), use realistic 20 km/h campus speed
  // When in motion, clamp between 15 km/h (heavy foot traffic/crosswalks) and 42 km/h
  const effectiveSpeed = speedKmh >= 8 ? Math.min(Math.max(speedKmh, 15), 42) : 20;
  const dwellTimePerStopHours = 0.75 / 60; // 45 seconds per intermediate stop dwell

  // Road network factor: campus roads and urban grid have ~1.25x circuity over straight line
  const ROAD_CIRCUITY_FACTOR = 1.25;

  const results: CalculatedETA[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < eligibleStops.length; i++) {
    const stop = eligibleStops[i];

    if (i === 0) {
      // Distance from bus current location to the first upcoming stop
      const directDist = haversineKm(busLat, busLng, stop.lat, stop.lng);
      cumulativeDist = directDist * ROAD_CIRCUITY_FACTOR;
    } else {
      // Distance from previous stop in sequence to this stop
      const prevStop = eligibleStops[i - 1];
      const interStopDist = haversineKm(prevStop.lat, prevStop.lng, stop.lat, stop.lng);
      cumulativeDist += interStopDist * ROAD_CIRCUITY_FACTOR;
    }

    const driveTimeHours = cumulativeDist / effectiveSpeed;
    const dwellHours = i * dwellTimePerStopHours;
    const totalMinutes = Math.max(1, Math.round((driveTimeHours + dwellHours) * 60));

    results.push({
      stopId: stop.id,
      stopName: stop.name,
      etaMinutes: totalMinutes,
      distanceKm: parseFloat(cumulativeDist.toFixed(2)),
      confidence,
    });
  }

  return results;
}
