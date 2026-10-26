import { Router, Response } from 'express';
import { db, BusRecord } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { calculateRouteETAs, determineConfidence } from '../utils/eta';
import { broadcastBusUpdate } from '../socket';

const router = Router();

export const ALLOWED_BUS_STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE', 'OFFLINE', 'OFF_DUTY', 'OUT_OF_SERVICE'];

export function normalizeBusStatus(status?: string): 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'OFFLINE' | undefined {
  if (!status) return undefined;
  const upper = status.toUpperCase().trim();
  if (upper === 'OFF_DUTY') return 'IDLE';
  if (upper === 'OUT_OF_SERVICE') return 'OFFLINE';
  if (['ACTIVE', 'IDLE', 'MAINTENANCE', 'OFFLINE'].includes(upper)) {
    return upper as 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'OFFLINE';
  }
  return undefined;
}

export function toClientBus(
  bus: BusRecord,
  extras?: {
    routeName?: string;
    routeColor?: string;
    upcomingEtas?: ReturnType<typeof calculateRouteETAs>;
  }
) {
  const confidence =
    bus.status === 'ACTIVE' && bus.gps_status !== 'GPS_ACTIVE'
      ? 'SCHEDULED'
      : determineConfidence(bus.last_sync_timestamp, bus.status, bus.is_simulated);
  const calculatedEtas = extras?.upcomingEtas;
  return {
    id: bus.id,
    collegeId: bus.college_id,
    busNumber: bus.bus_number,
    plateNumber: bus.plate_number,
    capacity: bus.capacity,
    model: bus.model,
    currentRouteId: bus.current_route_id,
    routeName: extras?.routeName,
    routeColor: extras?.routeColor,
    currentDriverId: bus.current_driver_id,
    driverName: bus.driver_name,
    status: normalizeBusStatus(bus.status) || 'IDLE',
    lastLocation: {
      lat: bus.last_location_lat,
      lng: bus.last_location_lng,
      speed: bus.speed_kmh / 3.6,
      heading: bus.heading,
      timestamp: bus.last_sync_timestamp,
    },
    heading: bus.heading,
    speedKmh: bus.speed_kmh,
    currentOccupancy: bus.current_occupancy,
    gpsStatus: bus.gps_status,
    networkStatus: bus.network_status,
    etaConfidence: confidence,
    isSimulated: bus.is_simulated,
    lastSyncTimestamp: bus.last_sync_timestamp,
    upcomingEtas: calculatedEtas,
    nextStop: calculatedEtas?.[0]
      ? {
          stopName: calculatedEtas[0].stopName,
          etaMinutes: calculatedEtas[0].etaMinutes,
          distanceKm: calculatedEtas[0].distanceKm,
        }
      : undefined,
  };
}

// GET /api/buses (Multi-Tenant, Scoped to College)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const routeFilter = req.query.routeId as string | undefined;

    const buses = await db.getBuses(collegeId, routeFilter);
    const routes = await db.getRoutes(collegeId);
    const allStops = await db.getStops(collegeId);

    // Enrich each bus with honest calculated confidence and ETAs
    const enrichedBuses = buses.map((bus) => {
      const confidence =
        bus.status === 'ACTIVE' && bus.gps_status !== 'GPS_ACTIVE'
          ? 'SCHEDULED'
          : determineConfidence(bus.last_sync_timestamp, bus.status, bus.is_simulated);
      const route = routes.find((r) => r.id === bus.current_route_id);
      const stops = allStops.filter((s) => s.route_id === bus.current_route_id);
      const calculatedEtas =
        confidence === 'LIVE' || confidence === 'DEGRADED'
          ? calculateRouteETAs(bus.last_location_lat, bus.last_location_lng, bus.speed_kmh, stops, confidence)
          : [];
      return toClientBus(bus, { routeName: route?.name, routeColor: route?.color, upcomingEtas: calculatedEtas });
    });

    res.json(enrichedBuses);
  } catch (err: any) {
    console.error('Error fetching buses:', err);
    res.status(500).json({ error: 'Failed to fetch buses.' });
  }
});

// GET /api/buses/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const bus = await db.getBusById(req.params.id, collegeId);

    if (!bus) {
      res.status(404).json({ error: 'Bus not found or does not belong to your college.' });
      return;
    }

    const confidence =
      bus.status === 'ACTIVE' && bus.gps_status !== 'GPS_ACTIVE'
        ? 'SCHEDULED'
        : determineConfidence(bus.last_sync_timestamp, bus.status, bus.is_simulated);
    const stops = await db.getStops(collegeId, bus.current_route_id);
    const calculatedEtas = calculateRouteETAs(
      bus.last_location_lat,
      bus.last_location_lng,
      bus.speed_kmh,
      stops,
      confidence
    );

    res.json({
      ...bus,
      status: normalizeBusStatus(bus.status) || 'IDLE',
      etaConfidence: confidence,
      upcomingEtas: calculatedEtas,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch bus.' });
  }
});

// POST /api/buses (Admin Only)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const { busNumber, plateNumber, capacity, model, currentRouteId, status } = req.body;

    if (!busNumber || !plateNumber) {
      res.status(400).json({ error: 'busNumber and plateNumber are required.' });
      return;
    }

    if (status && !ALLOWED_BUS_STATUSES.includes(status)) {
      res.status(400).json({
        error: `Invalid bus status: "${status}". Allowed values: ACTIVE, IDLE, MAINTENANCE, OFFLINE.`,
      });
      return;
    }

    const college = await db.getCollegeById(collegeId);
    const centerLat = college?.center_lat || 34.0537;
    const centerLng = college?.center_lng || -118.2570;

    const newBus: BusRecord = {
      id: 'bus_' + Date.now().toString(),
      college_id: collegeId,
      bus_number: busNumber.trim(),
      plate_number: plateNumber.trim(),
      capacity: Number(capacity) || 45,
      model: model?.trim() || 'Standard Transit Bus',
      current_route_id: currentRouteId || undefined,
      status: normalizeBusStatus(status) || 'IDLE',
      last_location_lat: centerLat,
      last_location_lng: centerLng,
      heading: 0,
      speed_kmh: 0,
      current_occupancy: 0,
      gps_status: 'GPS_SEARCHING',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'SCHEDULED',
      is_simulated: false,
      last_sync_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const created = await db.createBus(newBus);
    broadcastBusUpdate(collegeId, toClientBus(created));

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create bus.' });
  }
});

// PUT /api/buses/:id (Admin Only)
router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const busId = req.params.id;

    const existing = await db.getBusById(busId, collegeId);
    if (!existing) {
      res.status(404).json({ error: 'Bus not found.' });
      return;
    }

    const updates: Partial<BusRecord> = {};
    if (req.body.busNumber) updates.bus_number = req.body.busNumber;
    if (req.body.plateNumber) updates.plate_number = req.body.plateNumber;
    if (req.body.capacity) updates.capacity = Number(req.body.capacity);
    if (req.body.model) updates.model = req.body.model;
    if (req.body.currentRouteId !== undefined) updates.current_route_id = req.body.currentRouteId;
    if (req.body.currentDriverId !== undefined) {
      const driverId = req.body.currentDriverId || undefined;
      const activeTrip = await db.getActiveTripForBus(busId, collegeId);
      if (activeTrip && driverId !== activeTrip.driver_id) {
        res.status(409).json({
          error: 'Cannot reassign a bus while a trip is in progress. End the trip first.',
          activeTripId: activeTrip.id,
        });
        return;
      }
      if (driverId) {
        const driver = await db.getUserById(driverId);
        if (!driver || driver.college_id !== collegeId || driver.role !== 'DRIVER') {
          res.status(400).json({ error: 'Assigned driver must belong to this campus fleet.' });
          return;
        }
        updates.current_driver_id = driver.id;
        updates.driver_name = driver.name;
      } else {
        updates.current_driver_id = undefined;
        updates.driver_name = undefined;
      }
    }
    if (req.body.status !== undefined) {
      const normalized = normalizeBusStatus(req.body.status);
      if (!normalized) {
        res.status(400).json({
          error: `Invalid bus status: "${req.body.status}". Allowed values: ACTIVE, IDLE, MAINTENANCE, OFFLINE.`,
        });
        return;
      }
      updates.status = normalized;
    }

    const updated = await db.updateBus(busId, collegeId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Bus not found.' });
      return;
    }

    broadcastBusUpdate(collegeId, toClientBus(updated));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update bus.' });
  }
});

// DELETE /api/buses/:id (Admin Only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const deleted = await db.deleteBus(req.params.id, collegeId);
    if (!deleted) {
      res.status(404).json({ error: 'Bus not found or already deleted.' });
      return;
    }

    res.json({ success: true, message: 'Bus deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete bus.' });
  }
});

export default router;
