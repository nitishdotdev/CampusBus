import { Router, Response } from 'express';
import { db, TripRecord } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { broadcastTripStarted, broadcastTripEnded, broadcastOccupancyUpdate, broadcastBusUpdate } from '../socket';
import { validateTripStart, validateOccupancyInput } from '../utils/validation';
import { clearTripProgressionState } from '../utils/progression';

const router = Router();

// GET /api/trips/active (For Driver)
router.get('/active', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const activeTrip = await db.getActiveTripForDriver(user.userId, user.collegeId);
    if (!activeTrip) {
      res.json({ activeTrip: null });
      return;
    }

    const bus = await db.getBusById(activeTrip.bus_id, user.collegeId);
    const route = await db.getRouteById(activeTrip.route_id, user.collegeId);

    res.json({
      activeTrip: {
        id: activeTrip.id,
        collegeId: activeTrip.college_id,
        busId: activeTrip.bus_id,
        busNumber: bus?.bus_number,
        busCapacity: bus?.capacity || 45,
        routeId: activeTrip.route_id,
        routeName: route?.name,
        routeColor: route?.color,
        driverId: activeTrip.driver_id,
        status: activeTrip.status,
        startTime: activeTrip.start_time,
        currentOccupancy: activeTrip.current_occupancy,
        maxOccupancyRecorded: activeTrip.max_occupancy_recorded,
        distanceCoveredKm: activeTrip.distance_covered_km,
        totalLocationsLogged: activeTrip.total_locations_logged,
        syncedLocationsCount: activeTrip.synced_locations_count,
        queuedLocationsCount: activeTrip.queued_locations_count,
        currentStopId: activeTrip.current_stop_id || null,
        nextStopId: activeTrip.next_stop_id || null,
        completedStopIds: activeTrip.completed_stop_ids || [],
        stopArrivals: activeTrip.stop_arrivals || [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch active trip.' });
  }
});

// GET /api/trips (Trip History)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const driverFilter = user.role === 'DRIVER' ? user.userId : (req.query.driverId as string | undefined);
    const trips = await db.getTrips(user.collegeId, driverFilter);

    res.json(
      trips.map((t) => ({
        id: t.id,
        collegeId: t.college_id,
        busId: t.bus_id,
        routeId: t.route_id,
        driverId: t.driver_id,
        status: t.status,
        startTime: t.start_time,
        endTime: t.end_time,
        currentOccupancy: t.current_occupancy,
        maxOccupancyRecorded: t.max_occupancy_recorded,
        distanceCoveredKm: t.distance_covered_km,
        totalLocationsLogged: t.total_locations_logged,
        syncedLocationsCount: t.synced_locations_count,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch trip history.' });
  }
});

// POST /api/trips/start (Driver)
router.post('/start', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const validation = validateTripStart(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { busId, routeId } = validation.data;

    const bus = await db.getBusById(busId, user.collegeId);
    if (!bus) {
      res.status(404).json({ error: 'Bus not found in your college fleet.' });
      return;
    }

    const route = await db.getRouteById(routeId, user.collegeId);
    if (!route) {
      res.status(404).json({ error: 'Route not found in your college network.' });
      return;
    }

    // Check if the requested bus is ALREADY in an active trip by another driver
    const activeBusTrip = await db.getActiveTripForBus(busId, user.collegeId);
    if ((activeBusTrip && activeBusTrip.driver_id !== user.userId) || (bus.current_driver_id && bus.current_driver_id !== user.userId)) {
      res.status(409).json({
        error: `Bus ${bus.bus_number} is already in use by another driver. Cannot start multiple trips on same bus.`,
        activeTripId: activeBusTrip?.id,
        currentDriver: bus.driver_name,
      });
      return;
    }

    // Check if THIS driver already has an active trip in progress
    const existing = await db.getActiveTripForDriver(user.userId, user.collegeId);
    if (existing) {
      const existingRoute = await db.getRouteById(existing.route_id, user.collegeId);
      res.status(409).json({
        error: 'You already have an active trip in progress. End it before starting another.',
        activeTrip: {
          id: existing.id,
          busNumber: bus.bus_number,
          routeName: existingRoute?.name || 'Active Line',
          startTime: existing.start_time,
        },
      });
      return;
    }

    const routeStops = await db.getStops(user.collegeId, routeId);
    const sortedStops = [...routeStops].sort((a, b) => a.sequence - b.sequence);
    const firstStopId = sortedStops.length > 0 ? sortedStops[0].id : null;

    const newTrip: TripRecord = {
      id: 'trip_' + Date.now().toString(),
      college_id: user.collegeId,
      bus_id: busId,
      route_id: routeId,
      driver_id: user.userId,
      status: 'IN_PROGRESS',
      start_time: new Date().toISOString(),
      current_occupancy: 0,
      max_occupancy_recorded: 0,
      distance_covered_km: 0,
      total_locations_logged: 0,
      synced_locations_count: 0,
      queued_locations_count: 0,
      current_stop_id: null,
      next_stop_id: firstStopId,
      completed_stop_ids: [],
      stop_arrivals: [],
      created_at: new Date().toISOString(),
    };

    const createdTrip = await db.createTrip(newTrip);

    // Update bus state
    const updatedBus = await db.updateBus(busId, user.collegeId, {
      status: 'ACTIVE',
      current_route_id: routeId,
      current_driver_id: user.userId,
      driver_name: user.name,
      current_occupancy: 0,
      gps_status: 'GPS_ACTIVE',
      eta_confidence: 'LIVE',
      current_stop_id: null,
      next_stop_id: firstStopId,
      completed_stop_ids: [],
      last_sync_timestamp: new Date().toISOString(),
    });

    broadcastTripStarted(user.collegeId, {
      tripId: createdTrip.id,
      busId,
      routeId,
      driverId: user.userId,
      startTime: createdTrip.start_time,
    });

    if (updatedBus) {
      broadcastBusUpdate(user.collegeId, updatedBus);
    }

    res.status(201).json({
      success: true,
      trip: createdTrip,
      bus: updatedBus,
    });
  } catch (err: any) {
    console.error('Error starting trip:', err);
    res.status(500).json({ error: 'Failed to start trip.' });
  }
});

// POST /api/trips/end (Driver)
router.post('/end', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { tripId } = req.body;

    const activeTrip = tripId
      ? (await db.getTrips(user.collegeId, user.userId)).find((t) => t.id === tripId)
      : await db.getActiveTripForDriver(user.userId, user.collegeId);

    if (!activeTrip) {
      res.status(404).json({ error: 'No active trip found to complete.' });
      return;
    }

    clearTripProgressionState(activeTrip.id);

    const completed = await db.updateTrip(activeTrip.id, user.collegeId, {
      status: 'COMPLETED',
      end_time: new Date().toISOString(),
    });

    // Put bus back to off duty without automatically marking remaining stops completed
    const bus = await db.updateBus(activeTrip.bus_id, user.collegeId, {
      status: 'OFF_DUTY',
      current_occupancy: 0,
      gps_status: 'GPS_ACTIVE',
      eta_confidence: 'SCHEDULED',
      speed_kmh: 0,
      current_stop_id: null,
      next_stop_id: null,
      completed_stop_ids: [],
    });

    broadcastTripEnded(user.collegeId, {
      tripId: activeTrip.id,
      busId: activeTrip.bus_id,
      endTime: new Date().toISOString(),
    });

    if (bus) {
      broadcastBusUpdate(user.collegeId, bus);
    }

    res.json({
      success: true,
      trip: completed,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to end trip.' });
  }
});

// POST /api/trips/occupancy (Update passenger count)
router.post('/occupancy', requireAuth, requireRole(['DRIVER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const validation = validateOccupancyInput(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { delta, absoluteCount } = validation.data;

    const activeTrip = await db.getActiveTripForDriver(user.userId, user.collegeId);
    if (!activeTrip) {
      res.status(400).json({ error: 'No active trip in progress to update occupancy.' });
      return;
    }

    const bus = await db.getBusById(activeTrip.bus_id, user.collegeId);
    const maxCapacity = bus?.capacity || 45;

    let newCount = activeTrip.current_occupancy;
    if (typeof absoluteCount === 'number') {
      newCount = absoluteCount;
    } else if (typeof delta === 'number') {
      newCount += delta;
    }

    // Clamp between 0 and bus capacity
    newCount = Math.max(0, Math.min(newCount, maxCapacity));
    const newMax = Math.max(activeTrip.max_occupancy_recorded, newCount);

    await db.updateTrip(activeTrip.id, user.collegeId, {
      current_occupancy: newCount,
      max_occupancy_recorded: newMax,
    });

    await db.updateBus(activeTrip.bus_id, user.collegeId, {
      current_occupancy: newCount,
    });

    broadcastOccupancyUpdate(user.collegeId, {
      busId: activeTrip.bus_id,
      tripId: activeTrip.id,
      currentOccupancy: newCount,
      capacity: maxCapacity,
    });

    res.json({
      currentOccupancy: newCount,
      capacity: maxCapacity,
      isFull: newCount >= maxCapacity,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update occupancy.' });
  }
});

export default router;
