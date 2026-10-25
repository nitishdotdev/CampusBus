import { db, TripRecord, StopRecord, StopArrivalRecord, BusRecord } from '../db';
import { haversineKm } from './eta';
import { broadcastStopProgression, broadcastStopApproaching, broadcastBusUpdate } from '../socket';

export const DEFAULT_GEOFENCE_RADIUS_METERS = 50;
export const MAX_ALLOWED_ACCURACY_METERS = 65;
export const MAX_TELEMETRY_AGE_SECONDS = 60;
export const APPROACHING_DISTANCE_METERS = 250;

export interface TelemetryReading {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp?: string;
  isOfflineQueued?: boolean;
}

export interface ProgressionResult {
  evaluated: boolean;
  arrived: boolean;
  approaching: boolean;
  arrivedStop?: {
    id: string;
    name: string;
    sequence: number;
  };
  nextStop?: {
    id: string;
    name: string;
    sequence: number;
  } | null;
  completedStopIds: string[];
  distanceToNextStopM?: number;
  skippedReason?: string;
}

// In-memory candidate tracker for dwell time and jitter suppression per trip
interface GeofenceCandidate {
  stopId: string;
  consecutiveHits: number;
  firstHitTime: number;
}

const tripCandidateState = new Map<string, GeofenceCandidate>();

// Per-trip mutex for atomic, concurrency-safe stop progression
const tripMutexes = new Map<string, Promise<void>>();

export async function withTripLock<T>(tripId: string, task: () => Promise<T>): Promise<T> {
  const currentLock = tripMutexes.get(tripId) || Promise.resolve();
  let release: () => void = () => {};

  const newLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  tripMutexes.set(tripId, currentLock.then(() => newLock));

  try {
    await currentLock;
    return await task();
  } finally {
    release();
    if (tripMutexes.get(tripId) === currentLock.then(() => newLock)) {
      tripMutexes.delete(tripId);
    }
  }
}

/**
 * Calculate geographic distance in meters between two lat/lng coordinates.
 */
export function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/**
 * Resets any active candidate dwell state for a trip (e.g. upon trip completion).
 */
export function clearTripProgressionState(tripId: string): void {
  tripCandidateState.delete(tripId);
  tripMutexes.delete(tripId);
}

/**
 * Checks if geographic coordinates are valid, finite, and in WGS-84 bounds.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Determines the next eligible stop for a trip based strictly on the
 * authoritative route sequence and persisted completed stop IDs.
 * Correctly handles route loops and repeated coordinates.
 */
export function getNextEligibleStop(
  routeStops: StopRecord[],
  completedStopIds: string[]
): StopRecord | null {
  if (!routeStops || routeStops.length === 0) return null;
  const sorted = [...routeStops].sort((a, b) => a.sequence - b.sequence);

  // Find the first stop in sequence that has not been marked completed
  for (const stop of sorted) {
    if (!completedStopIds.includes(stop.id)) {
      return stop;
    }
  }

  return null;
}

/**
 * Evaluates GPS telemetry against the next eligible stop's geofence.
 * Validates freshness, accuracy, jitter suppression, and sequence progression.
 */
export async function processStopProgression(
  tripId: string,
  collegeId: string,
  telemetry: TelemetryReading,
  customGeofenceRadiusMeters?: number
): Promise<ProgressionResult> {
  return withTripLock(tripId, async () => {
    // Validate GPS coordinate values
    if (!isValidCoordinate(telemetry.lat, telemetry.lng)) {
      return {
        evaluated: false,
        arrived: false,
        approaching: false,
        completedStopIds: [],
        skippedReason: 'INVALID_TELEMETRY_COORDINATES',
      };
    }

    const recordedAt = telemetry.timestamp || new Date().toISOString();
    const recordedTime = new Date(recordedAt).getTime();
    const nowTime = Date.now();
    const ageSeconds = Math.max(0, (nowTime - recordedTime) / 1000);

    // Reject stale telemetry for live arrival detection (unless historical sync)
    if (!telemetry.isOfflineQueued && ageSeconds > MAX_TELEMETRY_AGE_SECONDS) {
      return {
        evaluated: false,
        arrived: false,
        approaching: false,
        completedStopIds: [],
        skippedReason: 'STALE_GPS_TELEMETRY',
      };
    }

    // Reject excessively inaccurate GPS readings (e.g. > 65m accuracy)
    if (
      telemetry.accuracy !== undefined &&
      telemetry.accuracy !== null &&
      Number.isFinite(telemetry.accuracy) &&
      telemetry.accuracy > MAX_ALLOWED_ACCURACY_METERS
    ) {
      return {
        evaluated: false,
        arrived: false,
        approaching: false,
        completedStopIds: [],
        skippedReason: 'POOR_GPS_ACCURACY',
      };
    }

    // Process within PostgreSQL row-level lock (or serialized file-backed lock)
    const opResult = await db.executeWithTripLock(
      tripId,
      collegeId,
      async (trip, updateTripFn) => {
        // Only process stop arrivals for active trips
        const statusStr = trip.status as string;
        if (statusStr !== 'IN_PROGRESS' && statusStr !== 'STARTED' && statusStr !== 'ACTIVE') {
          return {
            evaluated: false,
            arrived: false,
            approaching: false,
            completedStopIds: trip.completed_stop_ids || [],
            skippedReason: 'TRIP_NOT_ACTIVE',
          };
        }

        const routeStops = await db.getStops(collegeId, trip.route_id);
        if (!routeStops || routeStops.length === 0) {
          return {
            evaluated: true,
            arrived: false,
            approaching: false,
            completedStopIds: trip.completed_stop_ids || [],
            skippedReason: 'ROUTE_HAS_NO_STOPS',
          };
        }

        const completedIds = [...(trip.completed_stop_ids || [])];
        const nextStop = getNextEligibleStop(routeStops, completedIds);

        if (!nextStop) {
          return {
            evaluated: true,
            arrived: false,
            approaching: false,
            nextStop: null,
            completedStopIds: completedIds,
            skippedReason: 'ALL_STOPS_ALREADY_COMPLETED',
          };
        }

        // Guard against stops with missing or invalid coordinates
        if (!isValidCoordinate(nextStop.lat, nextStop.lng)) {
          return {
            evaluated: false,
            arrived: false,
            approaching: false,
            nextStop: { id: nextStop.id, name: nextStop.name, sequence: nextStop.sequence },
            completedStopIds: completedIds,
            skippedReason: 'INVALID_STOP_COORDINATES',
          };
        }

        // Calculate distance to next eligible stop in meters
        const distanceM = haversineKm(telemetry.lat, telemetry.lng, nextStop.lat, nextStop.lng) * 1000;

        const envGeofence = process.env.GEOFENCE_RADIUS_METERS ? Number(process.env.GEOFENCE_RADIUS_METERS) : NaN;
        const geofenceRadius = customGeofenceRadiusMeters || (Number.isFinite(envGeofence) && envGeofence > 0 ? envGeofence : DEFAULT_GEOFENCE_RADIUS_METERS);

        // Check approaching threshold (e.g. within 250m)
        const isApproaching = distanceM <= APPROACHING_DISTANCE_METERS && distanceM > geofenceRadius;
        if (isApproaching) {
          broadcastStopApproaching(collegeId, {
            tripId: trip.id,
            busId: trip.bus_id,
            stopId: nextStop.id,
            stopName: nextStop.name,
            distanceM: Math.round(distanceM),
          });
        }

        // Geofence boundary check
        if (distanceM > geofenceRadius) {
          // Vehicle is outside the geofence -> reset candidate tracker if it was targeting this stop
          const candidate = tripCandidateState.get(trip.id);
          if (candidate && candidate.stopId === nextStop.id) {
            tripCandidateState.delete(trip.id);
          }
          return {
            evaluated: true,
            arrived: false,
            approaching: isApproaching,
            nextStop: { id: nextStop.id, name: nextStop.name, sequence: nextStop.sequence },
            completedStopIds: completedIds,
            distanceToNextStopM: Math.round(distanceM),
          };
        }

        // Vehicle is inside the geofence (distance <= geofenceRadius)
        // Handle GPS jitter and repeated readings safely:
        let candidate = tripCandidateState.get(trip.id);
        const now = Date.now();

        if (!candidate || candidate.stopId !== nextStop.id) {
          candidate = {
            stopId: nextStop.id,
            consecutiveHits: 1,
            firstHitTime: now,
          };
          tripCandidateState.set(trip.id, candidate);
        } else {
          candidate.consecutiveHits++;
        }

        const dwellMs = now - candidate.firstHitTime;
        const isHighAccuracyClose = (telemetry.accuracy || 15) <= 25 && distanceM <= (geofenceRadius * 0.7);
        const isConfirmedArrival =
          telemetry.isOfflineQueued ||
          candidate.consecutiveHits >= 2 ||
          dwellMs >= 2000 ||
          isHighAccuracyClose;

        if (!isConfirmedArrival) {
          // Pending confirmation on next consecutive reading or dwell
          return {
            evaluated: true,
            arrived: false,
            approaching: false,
            nextStop: { id: nextStop.id, name: nextStop.name, sequence: nextStop.sequence },
            completedStopIds: completedIds,
            distanceToNextStopM: Math.round(distanceM),
            skippedReason: 'AWAITING_JITTER_CONFIRMATION',
          };
        }

        // Clean candidate state on confirmed arrival
        tripCandidateState.delete(trip.id);

        // Double check idempotency under the row lock: stop cannot be arrived twice
        if (completedIds.includes(nextStop.id)) {
          return {
            evaluated: true,
            arrived: false,
            approaching: false,
            completedStopIds: completedIds,
            skippedReason: 'STOP_ALREADY_COMPLETED',
          };
        }

        // Confirm and persist arrival
        const newCompletedIds = [...completedIds, nextStop.id];
        const newArrivalRecord: StopArrivalRecord = {
          stop_id: nextStop.id,
          stop_name: nextStop.name,
          sequence: nextStop.sequence,
          arrived_at: recordedAt,
          lat: telemetry.lat,
          lng: telemetry.lng,
          distance_to_stop_m: Math.round(distanceM),
        };

        const newStopArrivals = [...(trip.stop_arrivals || []), newArrivalRecord];

        // Determine following stop in route sequence
        const followingStop = getNextEligibleStop(routeStops, newCompletedIds);

        // Update trip persistence atomically under the transaction lock
        await updateTripFn({
          current_stop_id: nextStop.id,
          next_stop_id: followingStop?.id || null,
          completed_stop_ids: newCompletedIds,
          stop_arrivals: newStopArrivals,
        });

        return {
          evaluated: true,
          arrived: true,
          approaching: false,
          arrivedStop: {
            id: nextStop.id,
            name: nextStop.name,
            sequence: nextStop.sequence,
          },
          nextStop: followingStop
            ? {
                id: followingStop.id,
                name: followingStop.name,
                sequence: followingStop.sequence,
              }
            : null,
          completedStopIds: newCompletedIds,
          distanceToNextStopM: Math.round(distanceM),
          tripId: trip.id,
          busId: trip.bus_id,
          routeId: trip.route_id,
          recordedAt,
        };
      }
    );

    if (!opResult) {
      return {
        evaluated: false,
        arrived: false,
        approaching: false,
        completedStopIds: [],
        skippedReason: 'TRIP_NOT_FOUND',
      };
    }

    if (opResult.arrived && (opResult as any).busId) {
      const arrivedData = opResult as any;
      // Update bus persistence
      const updatedBus = await db.updateBus(arrivedData.busId, collegeId, {
        current_stop_id: arrivedData.arrivedStop.id,
        next_stop_id: arrivedData.nextStop?.id || null,
        completed_stop_ids: arrivedData.completedStopIds,
      });

      const progressionPayload = {
        tripId: arrivedData.tripId,
        busId: arrivedData.busId,
        routeId: arrivedData.routeId,
        arrivedStop: arrivedData.arrivedStop,
        nextStop: arrivedData.nextStop,
        completedStopIds: arrivedData.completedStopIds,
        timestamp: arrivedData.recordedAt,
      };

      // Broadcast validated stop arrival across all client dashboards
      broadcastStopProgression(collegeId, progressionPayload);

      if (updatedBus) {
        broadcastBusUpdate(collegeId, updatedBus);
      }
    }

    return {
      evaluated: opResult.evaluated,
      arrived: opResult.arrived,
      approaching: opResult.approaching,
      arrivedStop: opResult.arrivedStop,
      nextStop: opResult.nextStop,
      completedStopIds: opResult.completedStopIds,
      distanceToNextStopM: opResult.distanceToNextStopM,
      skippedReason: opResult.skippedReason,
    };
  });
}
