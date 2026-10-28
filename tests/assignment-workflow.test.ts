import { describe, expect, it, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { normalizeBusForClient } from '../server/socket';
import { validateCoordinates, validateTelemetry, validateTripStart } from '../server/utils/validation';
import { normalizeBusStatus } from '../server/routes/buses';
import driverRoutes from '../server/routes/driver';
import assignmentRoutes from '../server/routes/assignments';
import { signToken } from '../server/middleware/auth';
import { db, initDatabase } from '../server/db';

describe('Admin assignment -> Driver trip -> Persisted GPS -> Live-map workflow', () => {
  it('normalizes database BusRecord to client-facing camelCase with valid lastLocation', () => {
    const rawDbBus = {
      id: 'bus_101',
      college_id: 'col_apex',
      bus_number: 'BUS-101',
      plate_number: '7XYZ123',
      capacity: 45,
      model: 'Ford Transit',
      current_route_id: 'route_blue',
      current_driver_id: 'usr_driver_1',
      driver_name: 'Marcus Vance',
      status: 'ACTIVE',
      last_location_lat: 34.0537,
      last_location_lng: -118.2570,
      heading: 90,
      speed_kmh: 36,
      current_occupancy: 12,
      gps_status: 'GPS_ACTIVE',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'LIVE',
      is_simulated: false,
      last_sync_timestamp: '2026-10-25T12:00:00.000Z',
    };

    const clientBus = normalizeBusForClient(rawDbBus);

    expect(clientBus.id).toBe('bus_101');
    expect(clientBus.busNumber).toBe('BUS-101');
    expect(clientBus.currentDriverId).toBe('usr_driver_1');
    expect(clientBus.currentRouteId).toBe('route_blue');
    expect(clientBus.driverName).toBe('Marcus Vance');
    expect(clientBus.status).toBe('ACTIVE');
    expect(clientBus.lastLocation).toBeDefined();
    expect(clientBus.lastLocation.lat).toBe(34.0537);
    expect(clientBus.lastLocation.lng).toBe(-118.2570);
    expect(clientBus.speedKmh).toBe(36);
  });

  it('does NOT fabricate fake coordinates (34.0537, -118.2570) when last_location_lat is null or missing', () => {
    const busWithoutLocation = {
      id: 'bus_standby',
      college_id: 'col_apex',
      bus_number: 'BUS-STANDBY',
      plate_number: 'PLATE-001',
      capacity: 35,
      status: 'IDLE',
      last_location_lat: null,
      last_location_lng: null,
    };

    const clientBus = normalizeBusForClient(busWithoutLocation);
    expect(clientBus.lastLocation).toBeUndefined();
  });

  it('normalizes OFF_DUTY and OUT_OF_SERVICE bus statuses', () => {
    expect(normalizeBusStatus('OFF_DUTY')).toBe('IDLE');
    expect(normalizeBusStatus('OUT_OF_SERVICE')).toBe('OFFLINE');
    expect(normalizeBusStatus('ACTIVE')).toBe('ACTIVE');
    expect(normalizeBusStatus('IDLE')).toBe('IDLE');
    expect(normalizeBusStatus('MAINTENANCE')).toBe('MAINTENANCE');

    const normalizedOffDuty = normalizeBusForClient({
      id: 'bus_102',
      status: 'OFF_DUTY',
      bus_number: 'BUS-102',
    });
    expect(normalizedOffDuty.status).toBe('IDLE');
  });

  it('validates GPS telemetry before accepting driver location breadcrumbs', () => {
    // Valid coordinates
    const valid = validateCoordinates(34.0537, -118.2570);
    expect(valid.valid).toBe(true);
    expect(valid.data?.lat).toBe(34.0537);
    expect(valid.data?.lng).toBe(-118.2570);

    // Out of bounds coordinates rejected
    const invalidLat = validateCoordinates(95.0, -118.2570);
    expect(invalidLat.valid).toBe(false);

    const invalidLng = validateCoordinates(34.0537, 185.0);
    expect(invalidLng.valid).toBe(false);

    // Full telemetry payload validation
    const telemetry = validateTelemetry({
      lat: 34.0537,
      lng: -118.2570,
      speed: 15.5,
      heading: 180,
      accuracy: 5,
    });
    expect(telemetry.valid).toBe(true);
    expect(telemetry.data?.speed).toBe(15.5);
  });

  it('validates trip start requirements', () => {
    const validStart = validateTripStart({
      busId: 'bus_101',
      routeId: 'route_blue',
    });
    expect(validStart.valid).toBe(true);
    expect(validStart.data?.busId).toBe('bus_101');
    expect(validStart.data?.routeId).toBe('route_blue');

    const missingBus = validateTripStart({ routeId: 'route_blue' });
    expect(missingBus.valid).toBe(false);

    const missingRoute = validateTripStart({ busId: 'bus_101' });
    expect(missingRoute.valid).toBe(false);
  });
});

describe('API Security & Verification: Telemetry & Assignments', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/driver', driverRoutes);
  app.use('/api/assignments', assignmentRoutes);

  beforeAll(async () => {
    await initDatabase();
  });

  const collegeId = 'college_apex';

  const driver1Token = signToken({
    userId: 'usr_driver_marcus',
    collegeId,
    role: 'DRIVER',
    email: 'marcus@campus.edu',
    name: 'Marcus Vance',
  });

  const driver2Token = signToken({
    userId: 'usr_driver_other',
    collegeId,
    role: 'DRIVER',
    email: 'other@campus.edu',
    name: 'Other Driver',
  });

  const studentToken = signToken({
    userId: 'usr_student_1',
    collegeId,
    role: 'STUDENT',
    email: 'student@campus.edu',
    name: 'Student One',
  });

  const adminToken = signToken({
    userId: 'usr_admin_1',
    collegeId,
    role: 'ADMIN',
    email: 'admin@campus.edu',
    name: 'Transit Admin',
  });

  it('rejects unassigned driver attempting to submit telemetry for a bus', async () => {
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driver2Token}`)
      .send({
        busId: 'bus_104',
        tripId: 'no_trip',
        lat: 34.0537,
        lng: -118.2570,
        speed: 10,
        heading: 90,
      });

    // bus_apex_1 is assigned to usr_driver_marcus in seed data
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not assigned/i);
  });

  it('rejects student attempting to submit driver GPS telemetry', async () => {
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        busId: 'bus_104',
        lat: 34.0537,
        lng: -118.2570,
      });

    expect(res.status).toBe(403);
  });

  it('rejects student attempting to create an assignment', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        busId: 'bus_104',
        driverId: 'usr_driver_marcus',
        routeId: 'route_blue',
      });

    expect(res.status).toBe(403);
  });

  it('rejects assignment creation with missing required fields', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        busId: 'bus_104',
        // missing driverId and routeId
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects telemetry with invalid coordinates', async () => {
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driver1Token}`)
      .send({
        busId: 'bus_104',
        tripId: 'no_trip',
        lat: 195.0, // Invalid latitude > 90
        lng: -118.2570,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/latitude/i);
  });

  it('rejects live telemetry for an ended trip', async () => {
    // Create a completed trip in the database
    const completedTripId = 'trip_completed_test';
    await db.createTrip({
      id: completedTripId,
      college_id: collegeId,
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'COMPLETED',
      start_time: new Date(Date.now() - 3600000).toISOString(),
      end_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 20,
      distance_covered_km: 15,
      total_locations_logged: 50,
      synced_locations_count: 50,
      queued_locations_count: 0,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    });

    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driver1Token}`)
      .send({
        busId: 'bus_104',
        tripId: completedTripId,
        lat: 34.0537,
        lng: -118.2570,
        speed: 10,
        heading: 90,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended trip/i);
  });

  it('rejects batch location sync from an unassigned driver', async () => {
    const res = await request(app)
      .post('/api/driver/location/sync')
      .set('Authorization', `Bearer ${driver2Token}`)
      .send({
        busId: 'bus_104',
        locations: [
          {
            id: 'sync_pt_1',
            lat: 34.0537,
            lng: -118.2570,
            speed: 10,
            heading: 90,
            timestamp: new Date().toISOString(),
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not assigned/i);
  });

  it('rejects batch location sync for an ended trip', async () => {
    const endedTripId = 'trip_sync_ended_test';
    await db.createTrip({
      id: endedTripId,
      college_id: collegeId,
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'COMPLETED',
      start_time: new Date(Date.now() - 3600000).toISOString(),
      end_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 10,
      distance_covered_km: 10,
      total_locations_logged: 20,
      synced_locations_count: 20,
      queued_locations_count: 0,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    });

    const res = await request(app)
      .post('/api/driver/location/sync')
      .set('Authorization', `Bearer ${driver1Token}`)
      .send({
        busId: 'bus_104',
        tripId: endedTripId,
        locations: [
          {
            id: 'sync_pt_ended_1',
            lat: 34.0537,
            lng: -118.2570,
            speed: 10,
            heading: 90,
            timestamp: new Date().toISOString(),
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended trip/i);
  });

  it('rejects batch location sync for a nonexistent trip', async () => {
    const res = await request(app)
      .post('/api/driver/location/sync')
      .set('Authorization', `Bearer ${driver1Token}`)
      .send({
        busId: 'bus_104',
        tripId: 'nonexistent_trip_id_999',
        locations: [
          {
            id: 'sync_pt_ghost_1',
            lat: 34.0537,
            lng: -118.2570,
            speed: 10,
            heading: 90,
            timestamp: new Date().toISOString(),
          },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects batch location sync for mismatched bus and trip', async () => {
    const activeTripId = 'trip_mismatch_test';
    await db.createTrip({
      id: activeTripId,
      college_id: collegeId,
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'IN_PROGRESS',
      start_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 0,
      distance_covered_km: 0,
      total_locations_logged: 0,
      synced_locations_count: 0,
      queued_locations_count: 0,
      created_at: new Date().toISOString(),
    });

    // Provide existing bus_101 instead of trip's assigned bus_104
    const res = await request(app)
      .post('/api/driver/location/sync')
      .set('Authorization', `Bearer ${driver1Token}`)
      .send({
        busId: 'bus_101',
        tripId: activeTripId,
        locations: [
          {
            id: 'sync_pt_mismatch_1',
            lat: 34.0537,
            lng: -118.2570,
            speed: 10,
            heading: 90,
            timestamp: new Date().toISOString(),
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match/i);
  });

  it('verifies db.executeWithTripLock executes callback and persists updates atomically', async () => {
    const testTripId = 'trip_atomic_lock_test';
    await db.createTrip({
      id: testTripId,
      college_id: collegeId,
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'IN_PROGRESS',
      start_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 0,
      distance_covered_km: 0,
      total_locations_logged: 0,
      synced_locations_count: 0,
      queued_locations_count: 0,
      created_at: new Date().toISOString(),
    });

    const result = await db.executeWithTripLock(testTripId, collegeId, async (trip, updateFn) => {
      expect(trip.id).toBe(testTripId);
      const updated = await updateFn({ distance_covered_km: 4.2 });
      return updated?.distance_covered_km;
    });

    expect(result).toBe(4.2);
    const persisted = await db.getTripById(testTripId, collegeId);
    expect(persisted?.distance_covered_km).toBe(4.2);
  });
});
