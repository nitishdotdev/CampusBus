import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  calculateHaversineDistanceMeters,
  processStopProgression,
  clearTripProgressionState,
} from '../server/utils/progression';
import { calculateRouteETAs } from '../server/utils/eta';
import { normalizeBusForClient } from '../server/socket';
import { db, initDatabase, StopRecord } from '../server/db';

describe('Stop Progression & Geofence Arrival Suite', () => {
  const collegeId = 'col_apex';
  const routeId = 'route_progression_test';

  const stopApexMain: StopRecord = {
    id: 'stop_prog_1',
    college_id: collegeId,
    route_id: routeId,
    code: 'AM1',
    name: 'Apex Main Gate',
    sequence: 1,
    lat: 34.0522,
    lng: -118.2437,
    created_at: new Date().toISOString(),
  };

  const stopLibrary: StopRecord = {
    id: 'stop_prog_2',
    college_id: collegeId,
    route_id: routeId,
    code: 'LIB',
    name: 'University Library',
    sequence: 2,
    lat: 34.0535,
    lng: -118.2450,
    created_at: new Date().toISOString(),
  };

  const stopScienceHall: StopRecord = {
    id: 'stop_prog_3',
    college_id: collegeId,
    route_id: routeId,
    code: 'SCI',
    name: 'Science Hall',
    sequence: 3,
    lat: 34.0550,
    lng: -118.2470,
    created_at: new Date().toISOString(),
  };

  // Route loop: returns to Apex Main Gate coordinates as final stop in sequence
  const stopApexMainReturn: StopRecord = {
    id: 'stop_prog_4_return',
    college_id: collegeId,
    route_id: routeId,
    code: 'AM4',
    name: 'Apex Main Gate Return',
    sequence: 4,
    lat: 34.0522,
    lng: -118.2437,
    created_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    await initDatabase();
    // Seed test stops into database
    await db.createStop(stopApexMain);
    await db.createStop(stopLibrary);
    await db.createStop(stopScienceHall);
    await db.createStop(stopApexMainReturn);
  });

  it('calculates geographic distance accurately with Haversine formula', () => {
    // Exactly same point -> 0m
    const d0 = calculateHaversineDistanceMeters(34.0522, -118.2437, 34.0522, -118.2437);
    expect(d0).toBe(0);

    // Nearby point (~30m away)
    // 0.00027 deg lat difference at 34 deg is ~30 meters
    const d30 = calculateHaversineDistanceMeters(34.0522, -118.2437, 34.05247, -118.2437);
    expect(d30).toBeGreaterThan(25);
    expect(d30).toBeLessThan(35);

    // Further point (~150m away)
    const d150 = calculateHaversineDistanceMeters(34.0522, -118.2437, 34.0535, -118.2450);
    expect(d150).toBeGreaterThan(150);
  });

  describe('Geofence Arrival & Ordered Stop Progression', () => {
    let mockTrip: any;

    beforeEach(async () => {
      mockTrip = {
        id: `trip_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        college_id: collegeId,
        bus_id: 'bus_test_1',
        driver_id: 'driver_test_1',
        route_id: routeId,
        status: 'IN_PROGRESS',
        start_time: new Date().toISOString(),
        current_stop_id: null,
        next_stop_id: stopApexMain.id,
        completed_stop_ids: [],
        stop_arrivals: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.createTrip(mockTrip);
      clearTripProgressionState(mockTrip.id);
    });

    it('detects arrival when GPS reading is within 50m geofence', async () => {
      const freshTimestamp = new Date().toISOString();
      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 10,
        timestamp: freshTimestamp,
      });

      expect(result.arrived).toBe(true);
      expect(result.arrivedStop?.id).toBe(stopApexMain.id);
      expect(result.nextStop?.id).toBe(stopLibrary.id);
      expect(result.completedStopIds).toContain(stopApexMain.id);

      // Verify persisted state in database survives and is authoritative
      const persistedTrip = await db.getTripById(mockTrip.id, mockTrip.college_id);
      expect(persistedTrip?.current_stop_id).toBe(stopApexMain.id);
      expect(persistedTrip?.next_stop_id).toBe(stopLibrary.id);
      expect(persistedTrip?.completed_stop_ids).toContain(stopApexMain.id);
    });

    it('does NOT trigger arrival when GPS reading is outside 50m geofence', async () => {
      const freshTimestamp = new Date().toISOString();
      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0600,
        lng: -118.2600,
        accuracy: 10,
        timestamp: freshTimestamp,
      });

      expect(result.arrived).toBe(false);
      expect(result.nextStop?.id).toBe(stopApexMain.id);
      expect(result.completedStopIds.length).toBe(0);

      const persistedTrip = await db.getTripById(mockTrip.id, mockTrip.college_id);
      expect(persistedTrip?.current_stop_id).toBeNull();
      expect(persistedTrip?.next_stop_id).toBe(stopApexMain.id);
      expect(persistedTrip?.completed_stop_ids?.length || 0).toBe(0);
    });

    it('rejects stale GPS telemetry (> 60 seconds old) for stop arrival', async () => {
      const staleTimestamp = new Date(Date.now() - 120 * 1000).toISOString(); // 2 mins ago
      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 10,
        timestamp: staleTimestamp,
      });

      expect(result.arrived).toBe(false);
      expect(result.skippedReason).toBe('STALE_GPS_TELEMETRY');
      expect(result.completedStopIds.length).toBe(0);
    });

    it('rejects excessively inaccurate GPS telemetry (> 65m accuracy radius)', async () => {
      const freshTimestamp = new Date().toISOString();
      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 120, // 120m accuracy radius is too noisy
        timestamp: freshTimestamp,
      });

      expect(result.arrived).toBe(false);
      expect(result.skippedReason).toBe('POOR_GPS_ACCURACY');
      expect(result.completedStopIds.length).toBe(0);
    });

    it('is idempotent and prevents duplicate arrivals for the same stop', async () => {
      const freshTimestamp = new Date().toISOString();
      // First hit -> arrives at stopApexMain
      const firstResult = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 10,
        timestamp: freshTimestamp,
      });
      expect(firstResult.arrived).toBe(true);
      expect(firstResult.arrivedStop?.id).toBe(stopApexMain.id);

      // Second reading while still lingering at stopApexMain
      const secondResult = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });

      // Should not arrive again at stopApexMain (it's already completed and next stop is stopLibrary)
      expect(secondResult.arrived).toBe(false);
      expect(secondResult.completedStopIds).toHaveLength(1);
      expect(secondResult.completedStopIds).toContain(stopApexMain.id);
    });

    it('strictly enforces sequential progression and prevents skipping stops', async () => {
      const freshTimestamp = new Date().toISOString();
      // The bus is geographically at stopLibrary, but stopApexMain is still the next eligible stop!
      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopLibrary.lat,
        lng: stopLibrary.lng,
        accuracy: 10,
        timestamp: freshTimestamp,
      });

      // Arrival should NOT trigger for stopLibrary because stopApexMain was not reached yet
      expect(result.arrived).toBe(false);
      expect(result.nextStop?.id).toBe(stopApexMain.id);
      expect(result.completedStopIds.length).toBe(0);
    });

    it('handles route loops where geographic coordinates repeat based on sequence', async () => {
      // Step 1: Arrive at stop 1 (Apex Main Gate)
      const res1 = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopApexMain.lat,
        lng: stopApexMain.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });
      expect(res1.arrived).toBe(true);
      expect(res1.arrivedStop?.id).toBe(stopApexMain.id);
      expect(res1.nextStop?.id).toBe(stopLibrary.id);

      // Step 2: Arrive at stop 2 (Library)
      const res2 = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopLibrary.lat,
        lng: stopLibrary.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });
      expect(res2.arrived).toBe(true);
      expect(res2.arrivedStop?.id).toBe(stopLibrary.id);
      expect(res2.nextStop?.id).toBe(stopScienceHall.id);

      // Step 3: Arrive at stop 3 (Science Hall)
      const res3 = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopScienceHall.lat,
        lng: stopScienceHall.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });
      expect(res3.arrived).toBe(true);
      expect(res3.arrivedStop?.id).toBe(stopScienceHall.id);
      expect(res3.nextStop?.id).toBe(stopApexMainReturn.id);

      // Step 4: Arrive back at Apex Main Gate (stop 4 loop)
      const res4 = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopApexMainReturn.lat,
        lng: stopApexMainReturn.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });
      expect(res4.arrived).toBe(true);
      expect(res4.arrivedStop?.id).toBe(stopApexMainReturn.id);
      expect(res4.nextStop).toBeNull(); // Last stop arrived!
      expect(res4.completedStopIds).toHaveLength(4);
    });

    it('safely skips stops with missing, NaN, or out-of-range coordinates without false arrivals', async () => {
      const corruptRouteId = 'route_corrupt_test';
      const corruptStop = {
        id: 'corrupt_stop_1',
        college_id: collegeId,
        route_id: corruptRouteId,
        code: 'BAD',
        name: 'Corrupt Coords Stop',
        sequence: 1,
        lat: NaN,
        lng: 999.0, // invalid longitude
        created_at: new Date().toISOString(),
      };
      await db.createStop(corruptStop);

      const corruptTrip = {
        id: `trip_corrupt_${Date.now()}`,
        college_id: collegeId,
        bus_id: 'bus_test_corrupt',
        driver_id: 'driver_test_1',
        route_id: corruptRouteId,
        status: 'IN_PROGRESS',
        start_time: new Date().toISOString(),
        current_stop_id: null,
        next_stop_id: 'corrupt_stop_1',
        completed_stop_ids: [],
        stop_arrivals: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.createTrip(corruptTrip as unknown as any);

      const result = await processStopProgression(corruptTrip.id, corruptTrip.college_id, {
        lat: 34.0522,
        lng: -118.2437,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });

      expect(result.arrived).toBe(false);
      expect(result.skippedReason).toBe('INVALID_STOP_COORDINATES');
      expect(result.completedStopIds).toHaveLength(0);
    });

    it('safely handles concurrent telemetry updates for the same trip with serialization locks', async () => {
      // Fire 5 simultaneous progression requests with coordinates inside the geofence
      const promises = Array.from({ length: 5 }).map(() =>
        processStopProgression(mockTrip.id, mockTrip.college_id, {
          lat: stopApexMain.lat,
          lng: stopApexMain.lng,
          accuracy: 10,
          timestamp: new Date().toISOString(),
        })
      );

      const results = await Promise.all(promises);

      // Exactly ONE arrival should be registered
      const arrivalEvents = results.filter((r) => r.arrived);
      expect(arrivalEvents.length).toBe(1);

      // Persisted stop_arrivals in DB must contain exactly 1 entry for this stop
      const persistedTrip = await db.getTripById(mockTrip.id, mockTrip.college_id);
      expect(persistedTrip?.completed_stop_ids).toHaveLength(1);
      expect(persistedTrip?.stop_arrivals).toHaveLength(1);
    });

    it('rejects stop progression telemetry for ended or cancelled trips', async () => {
      // End the trip
      await db.updateTrip(mockTrip.id, mockTrip.college_id, {
        status: 'COMPLETED',
        end_time: new Date().toISOString(),
      });

      const result = await processStopProgression(mockTrip.id, mockTrip.college_id, {
        lat: stopApexMain.lat,
        lng: stopApexMain.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });

      expect(result.arrived).toBe(false);
      expect(result.skippedReason).toBe('TRIP_NOT_ACTIVE');
    });

    it('enforces college tenant isolation and rejects mismatched college IDs', async () => {
      const result = await processStopProgression(mockTrip.id, 'other_rogue_college', {
        lat: stopApexMain.lat,
        lng: stopApexMain.lng,
        accuracy: 10,
        timestamp: new Date().toISOString(),
      });

      expect(result.arrived).toBe(false);
      expect(result.skippedReason).toBe('TRIP_NOT_FOUND');
    });
  });

  describe('Client Normalization & Progression Parity', () => {
    it('includes currentStopId, nextStopId, and completedStopIds in normalizeBusForClient', () => {
      const rawBus = {
        id: 'bus_test_norm',
        college_id: 'col_apex',
        bus_number: 'BUS-NORM',
        plate_number: 'XYZ-999',
        capacity: 40,
        status: 'ACTIVE',
        last_location_lat: 34.0522,
        last_location_lng: -118.2437,
        current_stop_id: 'stop_prog_1',
        next_stop_id: 'stop_prog_2',
        completed_stop_ids: ['stop_prog_1'],
        last_sync_timestamp: new Date().toISOString(),
      };

      const normalized = normalizeBusForClient(rawBus);
      expect(normalized.currentStopId).toBe('stop_prog_1');
      expect(normalized.nextStopId).toBe('stop_prog_2');
      expect(normalized.completedStopIds).toEqual(['stop_prog_1']);
    });
  });

  describe('Honest ETA Calculations with Stop Progression', () => {
    const stopsInput = [stopApexMain, stopLibrary, stopScienceHall];

    it('returns empty ETAs when bus telemetry is offline or unavailable', () => {
      const etas = calculateRouteETAs(
        34.0522,
        -118.2437,
        25,
        stopsInput,
        'OFFLINE'
      );
      expect(etas.length).toBe(0);
    });

    it('returns empty ETAs when coordinates are invalid or NaN', () => {
      const etas = calculateRouteETAs(
        NaN,
        -118.2437,
        25,
        stopsInput,
        'LIVE'
      );
      expect(etas.length).toBe(0);
    });

    it('calculates ETAs accounting for completed stops and road circuity', () => {
      // If stop 1 is already completed, ETA is calculated for remaining upcoming stops (stop 2, stop 3)
      const etas = calculateRouteETAs(
        34.0522,
        -118.2437,
        30,
        stopsInput,
        'LIVE',
        {
          completedStopIds: [stopApexMain.id],
          nextStopId: stopLibrary.id,
        }
      );

      // Stop 1 should not be in the upcoming ETAs list
      expect(etas.find((e) => e.stopId === stopApexMain.id)).toBeUndefined();

      // Stop 2 is first upcoming
      const etaStop2 = etas.find((e) => e.stopId === stopLibrary.id);
      expect(etaStop2).toBeDefined();
      expect(etaStop2!.etaMinutes).toBeGreaterThanOrEqual(1);

      // Stop 3 is further along the route
      const etaStop3 = etas.find((e) => e.stopId === stopScienceHall.id);
      expect(etaStop3).toBeDefined();
      expect(etaStop3!.etaMinutes).toBeGreaterThanOrEqual(etaStop2!.etaMinutes);
      expect(etaStop3!.distanceKm).toBeGreaterThan(etaStop2!.distanceKm);
    });
  });
});
