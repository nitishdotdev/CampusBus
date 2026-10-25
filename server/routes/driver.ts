import { Router, Response } from 'express';
import { db, LocationRecord, EmergencyAlertRecord } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { broadcastBusLocation, broadcastBusUpdate, broadcastEmergencyAlert } from '../socket';
import { determineConfidence, calculateRouteETAs } from '../utils/eta';
import { validateTelemetry } from '../utils/validation';
import { processStopProgression } from '../utils/progression';

const router = Router();

// GET /api/driver/assignments (Driver's current active trip or vehicle assignment)
router.get('/assignments', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Check if driver has an active trip in progress
    const activeTrip = await db.getActiveTripForDriver(user.userId, user.collegeId);
    if (activeTrip) {
      const bus = await db.getBusById(activeTrip.bus_id, user.collegeId);
      const route = await db.getRouteById(activeTrip.route_id, user.collegeId);
      const stops = await db.getStops(user.collegeId, activeTrip.route_id);

      res.json({
        assignment: {
          tripId: activeTrip.id,
          busId: bus?.id,
          busNumber: bus?.bus_number,
          busCapacity: bus?.capacity,
          routeId: route?.id,
          routeName: route?.name,
          routeCode: route?.code,
          stops,
          currentStopId: activeTrip.current_stop_id || bus?.current_stop_id || null,
          nextStopId: activeTrip.next_stop_id || bus?.next_stop_id || (stops[0]?.id || null),
          completedStopIds: activeTrip.completed_stop_ids || bus?.completed_stop_ids || [],
          stopArrivals: activeTrip.stop_arrivals || [],
          status: activeTrip.status,
          startTime: activeTrip.start_time,
          currentOccupancy: activeTrip.current_occupancy,
        },
      });
      return;
    }

    // Check if a bus is assigned to this driver in the fleet
    const collegeBuses = await db.getBuses(user.collegeId);
    const assignedBus = collegeBuses.find((b) => b.current_driver_id === user.userId);
    if (assignedBus) {
      const route = assignedBus.current_route_id ? await db.getRouteById(assignedBus.current_route_id, user.collegeId) : null;
      const stops = assignedBus.current_route_id ? await db.getStops(user.collegeId, assignedBus.current_route_id) : [];

      res.json({
        assignment: {
          tripId: null,
          busId: assignedBus.id,
          busNumber: assignedBus.bus_number,
          busCapacity: assignedBus.capacity,
          routeId: route?.id || null,
          routeName: route?.name || null,
          routeCode: route?.code || null,
          stops,
          status: 'IDLE',
          startTime: null,
          currentOccupancy: assignedBus.current_occupancy || 0,
        },
      });
      return;
    }

    res.json({ assignment: null });
  } catch (err: any) {
    console.error('Error fetching driver assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
});

// POST /api/driver/location (Single real-time breadcrumb from browser GPS)
router.post('/location', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { tripId, busId, lat, lng, speed, heading, accuracy, timestamp, isSimulated, id } = req.body;

    if (!busId || typeof busId !== 'string') {
      res.status(400).json({ error: 'busId is required and must be a valid string.' });
      return;
    }

    // Verify bus exists in caller's college fleet
    const bus = await db.getBusById(busId, user.collegeId);
    if (!bus) {
      res.status(404).json({ error: 'Bus not found in your college fleet.' });
      return;
    }

    // Verify trip status: no new GPS events accepted as live telemetry for an ended trip
    if (tripId && tripId !== 'no_trip') {
      const trip = await db.getTripById(tripId, user.collegeId);
      if (!trip) {
        res.status(404).json({ error: `Trip (${tripId}) not found in your college.` });
        return;
      }
      if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
        res.status(400).json({ error: `Cannot accept live telemetry for ended trip (${tripId}).` });
        return;
      }
      if (user.role === 'DRIVER' && trip.driver_id !== user.userId) {
        res.status(403).json({ error: 'Driver is not authorized to submit telemetry for this trip.' });
        return;
      }
      if (trip.bus_id !== busId) {
        res.status(400).json({ error: 'Trip does not match the provided busId.' });
        return;
      }
    } else if (user.role === 'DRIVER') {
      if (bus.current_driver_id !== user.userId) {
        res.status(403).json({ error: 'You are not assigned to this bus.' });
        return;
      }
    }

    // Validate GPS telemetry and coordinates
    const telemetryValidation = validateTelemetry({ lat, lng, speed, heading, accuracy });
    if (!telemetryValidation.valid || !telemetryValidation.data) {
      res.status(400).json({ error: telemetryValidation.error });
      return;
    }

    const validData = telemetryValidation.data;
    const recordedAt = timestamp || new Date().toISOString();
    const speedKmh = validData.speed !== undefined ? Math.round(validData.speed * 3.6) : 22;

    // 1. Persist breadcrumb in locations log
    const locRecord: LocationRecord = {
      id: id || ('loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      trip_id: tripId || 'no_trip',
      bus_id: busId,
      college_id: user.collegeId,
      lat: validData.lat,
      lng: validData.lng,
      speed: validData.speed,
      heading: validData.heading,
      accuracy: validData.accuracy,
      recorded_at: recordedAt,
      is_offline_queued: false,
      created_at: new Date().toISOString(),
    };

    await db.saveLocation(locRecord);

    // 2. Update Bus vehicle state
    const confidence = determineConfidence(recordedAt, 'ACTIVE', Boolean(isSimulated));
    await db.updateBus(busId, user.collegeId, {
      last_location_lat: validData.lat,
      last_location_lng: validData.lng,
      speed_kmh: speedKmh,
      heading: validData.heading !== undefined ? validData.heading : 0,
      gps_status: 'GPS_ACTIVE',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: confidence,
      is_simulated: Boolean(isSimulated),
      last_sync_timestamp: recordedAt,
    });

    // 3. Process backend-validated stop progression if on an active trip
    let progression = null;
    if (tripId && tripId !== 'no_trip') {
      progression = await processStopProgression(tripId, user.collegeId, {
        lat: validData.lat,
        lng: validData.lng,
        speed: validData.speed,
        heading: validData.heading,
        accuracy: validData.accuracy,
        timestamp: recordedAt,
        isOfflineQueued: false,
      });
    }

    // 4. Retrieve authoritative refreshed bus record
    const updatedBus = await db.getBusById(busId, user.collegeId);

    // 5. Compute honest upcoming ETAs for real-time broadcast
    if (updatedBus) {
      const stops = await db.getStops(user.collegeId, updatedBus.current_route_id);
      const upcomingEtas = calculateRouteETAs(
        validData.lat,
        validData.lng,
        speedKmh,
        stops,
        confidence,
        {
          completedStopIds: updatedBus.completed_stop_ids,
          nextStopId: updatedBus.next_stop_id,
        }
      );

      const payload = {
        busId,
        tripId,
        lat: validData.lat,
        lng: validData.lng,
        speedKmh,
        heading: validData.heading || 0,
        accuracy: validData.accuracy || 10,
        timestamp: recordedAt,
        gpsStatus: 'GPS_ACTIVE',
        networkStatus: 'NETWORK_ONLINE',
        etaConfidence: confidence,
        isSimulated: Boolean(isSimulated),
        currentStopId: updatedBus.current_stop_id || null,
        nextStopId: updatedBus.next_stop_id || null,
        completedStopIds: updatedBus.completed_stop_ids || [],
        upcomingEtas,
        nextStop: upcomingEtas[0]
          ? {
              stopName: upcomingEtas[0].stopName,
              etaMinutes: upcomingEtas[0].etaMinutes,
              distanceKm: upcomingEtas[0].distanceKm,
            }
          : undefined,
        progression,
      };

      broadcastBusLocation(user.collegeId, payload);
      broadcastBusUpdate(user.collegeId, {
        ...updatedBus,
        upcomingEtas,
        nextStop: payload.nextStop,
      });
    }

    res.json({
      success: true,
      syncedAt: recordedAt,
      confidence,
      progression,
    });
  } catch (err: any) {
    console.error('Error saving driver location:', err);
    res.status(500).json({ error: 'Failed to record location breadcrumb.' });
  }
});

// POST /api/driver/location/sync (Batch upload of offline queued locations)
router.post('/location/sync', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { tripId, busId, locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      res.status(400).json({ error: 'locations must be a non-empty array of queued points.' });
      return;
    }

    const targetBusId = busId || locations[0]?.busId;
    if (!targetBusId || typeof targetBusId !== 'string') {
      res.status(400).json({ error: 'Valid busId is required for location sync.' });
      return;
    }

    // Verify bus exists in caller's college fleet
    const bus = await db.getBusById(targetBusId, user.collegeId);
    if (!bus) {
      res.status(404).json({ error: 'Bus not found in your college fleet.' });
      return;
    }

    // Authorization & trip state check
    let activeTripRecord = null;
    if (tripId && tripId !== 'no_trip') {
      const trip = await db.getTripById(tripId, user.collegeId);
      if (!trip) {
        res.status(404).json({ error: `Trip (${tripId}) not found in your college.` });
        return;
      }
      if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
        res.status(400).json({ error: `Cannot accept telemetry for ended trip (${tripId}).` });
        return;
      }
      if (user.role === 'DRIVER' && trip.driver_id !== user.userId) {
        res.status(403).json({ error: 'Driver is not authorized to submit telemetry for this trip.' });
        return;
      }
      if (trip.bus_id !== targetBusId) {
        res.status(400).json({ error: 'Trip does not match the provided busId.' });
        return;
      }
      activeTripRecord = trip;
    } else if (user.role === 'DRIVER') {
      if (bus.current_driver_id !== user.userId) {
        res.status(403).json({ error: 'You are not assigned to this bus.' });
        return;
      }
    }

    // Validate coordinates on every single queued location point
    const validatedRecords: LocationRecord[] = [];
    for (let i = 0; i < locations.length; i++) {
      const item = locations[i];
      const validation = validateTelemetry({
        lat: item.lat,
        lng: item.lng,
        speed: item.speed,
        heading: item.heading,
        accuracy: item.accuracy,
      });

      if (!validation.valid || !validation.data) {
        res.status(400).json({
          error: `Invalid coordinates at index ${i}: ${validation.error}`,
          failedIndex: i,
        });
        return;
      }

      validatedRecords.push({
        id: item.id || `sync_${Date.now()}_${i}`,
        trip_id: tripId || item.tripId || 'no_trip',
        bus_id: targetBusId,
        college_id: user.collegeId,
        lat: validation.data.lat,
        lng: validation.data.lng,
        speed: validation.data.speed,
        heading: validation.data.heading,
        accuracy: validation.data.accuracy,
        recorded_at: item.timestamp || new Date().toISOString(),
        is_offline_queued: true,
        created_at: new Date().toISOString(),
      });
    }

    // Sort chronologically
    validatedRecords.sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    let savedCount = 0;
    const failedIndices: number[] = [];
    const savedIds: string[] = [];

    for (let i = 0; i < validatedRecords.length; i++) {
      try {
        const saved = await db.saveLocation(validatedRecords[i]);
        if (saved) {
          savedCount++;
          savedIds.push(validatedRecords[i].id);
        } else {
          failedIndices.push(i);
        }
      } catch (err) {
        console.warn(`Failed to save location at index ${i}:`, err);
        failedIndices.push(i);
      }
    }

    // Update bus state with latest successfully saved point only if trip is not ended
    const isTripEnded = activeTripRecord && (activeTripRecord.status === 'COMPLETED' || activeTripRecord.status === 'CANCELLED');
    const successfullySavedRecords = validatedRecords.filter((r) => savedIds.includes(r.id));
    const latest = successfullySavedRecords.length > 0 ? successfullySavedRecords[successfullySavedRecords.length - 1] : validatedRecords[validatedRecords.length - 1];
    const latestSpeedKmh = latest.speed !== undefined ? Math.round(latest.speed * 3.6) : 22;
    const confidence = determineConfidence(latest.recorded_at, 'ACTIVE', false);

    let updatedBus = null;
    if (targetBusId && successfullySavedRecords.length > 0 && !isTripEnded) {
      await db.updateBus(targetBusId, user.collegeId, {
        last_location_lat: latest.lat,
        last_location_lng: latest.lng,
        speed_kmh: latestSpeedKmh,
        heading: latest.heading !== undefined ? latest.heading : 0,
        gps_status: 'GPS_ACTIVE',
        network_status: 'NETWORK_ONLINE',
        eta_confidence: confidence,
        last_sync_timestamp: new Date().toISOString(),
      });

      // Process stop progression sequentially through queued telemetry
      if (tripId && tripId !== 'no_trip') {
        for (const pt of successfullySavedRecords) {
          await processStopProgression(tripId, user.collegeId, {
            lat: pt.lat,
            lng: pt.lng,
            speed: pt.speed,
            heading: pt.heading,
            accuracy: pt.accuracy,
            timestamp: pt.recorded_at,
            isOfflineQueued: true,
          });
        }
      }

      updatedBus = await db.getBusById(targetBusId, user.collegeId);
    }

    if (tripId && savedCount > 0) {
      const trip = (await db.getTrips(user.collegeId, user.userId)).find((t) => t.id === tripId);
      if (trip) {
        await db.updateTrip(trip.id, user.collegeId, {
          total_locations_logged: trip.total_locations_logged + savedCount,
          synced_locations_count: trip.synced_locations_count + savedCount,
        });
      }
    }

    if (updatedBus) {
      broadcastBusLocation(user.collegeId, {
        busId: targetBusId,
        tripId,
        lat: Number(latest.lat),
        lng: Number(latest.lng),
        speedKmh: latestSpeedKmh,
        heading: latest.heading || 0,
        timestamp: new Date().toISOString(),
        gpsStatus: 'GPS_ACTIVE',
        networkStatus: 'NETWORK_ONLINE',
        etaConfidence: confidence,
      });
      broadcastBusUpdate(user.collegeId, updatedBus);
    }

    res.json({
      success: true,
      savedCount,
      syncedPointsCount: savedCount,
      savedIds,
      failedIndices,
      latestLocation: {
        lat: latest.lat,
        lng: latest.lng,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error syncing queued locations:', err);
    res.status(500).json({ error: 'Failed to synchronize queued locations.' });
  }
});

// POST /api/driver/emergency (Emergency Alert)
router.post('/emergency', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { tripId, busId, reason, description, type, lat, lng } = req.body;

    const alertReason = (reason || description || type || 'Emergency Protocol Triggered').trim();

    const bus = busId ? await db.getBusById(busId, user.collegeId) : null;
    const route = bus?.current_route_id ? await db.getRouteById(bus.current_route_id, user.collegeId) : null;

    const alertRecord: EmergencyAlertRecord = {
      id: 'alert_' + Date.now().toString(),
      college_id: user.collegeId,
      trip_id: tripId || undefined,
      bus_id: busId || undefined,
      driver_id: user.userId,
      bus_number: bus?.bus_number || 'BUS-UNKNOWN',
      route_name: route?.name || 'In-Service Route',
      driver_name: user.name,
      reason: alertReason,
      location_lat: Number(lat || bus?.last_location_lat || 34.0537),
      location_lng: Number(lng || bus?.last_location_lng || -118.2570),
      timestamp: new Date().toISOString(),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    const created = await db.createEmergencyAlert(alertRecord);
    broadcastEmergencyAlert(user.collegeId, created);

    // Also post high-priority campus notification
    await db.createNotification({
      id: 'notif_emg_' + Date.now().toString(),
      college_id: user.collegeId,
      route_id: bus?.current_route_id,
      title: `Emergency Protocol: ${bus?.bus_number || 'Campus Bus'}`,
      message: `Emergency signal received from ${user.name} on ${bus?.bus_number}: "${reason}". Campus dispatch notified.`,
      category: 'EMERGENCY',
      priority: 'URGENT',
      timestamp: new Date().toISOString(),
      is_read: false,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      alert: created,
    });
  } catch (err: any) {
    console.error('Error triggering emergency alert:', err);
    res.status(500).json({ error: 'Failed to record emergency alert.' });
  }
});

export default router;
