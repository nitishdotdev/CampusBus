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
      const confidence = determineConfidence(bus.last_sync_timestamp, bus.status, bus.is_simulated);
      const route = routes.find((r) => r.id === bus.current_route_id);
      const stops = allStops.filter((s) => s.route_id === bus.current_route_id);

      const calculatedEtas = calculateRouteETAs(
        bus.last_location_lat,
        bus.last_location_lng,
        bus.speed_kmh,
        stops,
        confidence,
        {
          completedStopIds: bus.completed_stop_ids,
          nextStopId: bus.next_stop_id,
        }
      );

      return {
        id: bus.id,
        collegeId: bus.college_id,
        busNumber: bus.bus_number,
        plateNumber: bus.plate_number,
        capacity: bus.capacity,
        model: bus.model,
        currentRouteId: bus.current_route_id,
        routeName: route?.name,
        routeColor: route?.color,
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
        currentStopId: bus.current_stop_id || null,
        nextStopId: bus.next_stop_id || null,
        completedStopIds: bus.completed_stop_ids || [],
        upcomingEtas: calculatedEtas,
        nextStop: calculatedEtas[0]
          ? {
              stopName: calculatedEtas[0].stopName,
              etaMinutes: calculatedEtas[0].etaMinutes,
              distanceKm: calculatedEtas[0].distanceKm,
            }
          : undefined,
        etaToNextStopSeconds: calculatedEtas[0]?.etaMinutes ? calculatedEtas[0].etaMinutes * 60 : undefined,
      };
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

    const confidence = determineConfidence(bus.last_sync_timestamp, bus.status, bus.is_simulated);
    const stops = await db.getStops(collegeId, bus.current_route_id);
    const calculatedEtas = calculateRouteETAs(
      bus.last_location_lat,
      bus.last_location_lng,
      bus.speed_kmh,
      stops,
      confidence,
      {
        completedStopIds: bus.completed_stop_ids,
        nextStopId: bus.next_stop_id,
      }
    );

    res.json({
      ...bus,
      status: normalizeBusStatus(bus.status) || 'IDLE',
      currentStopId: bus.current_stop_id || null,
      nextStopId: bus.next_stop_id || null,
      completedStopIds: bus.completed_stop_ids || [],
      etaConfidence: confidence,
      upcomingEtas: calculatedEtas,
      nextStop: calculatedEtas[0]
        ? {
            stopName: calculatedEtas[0].stopName,
            etaMinutes: calculatedEtas[0].etaMinutes,
            distanceKm: calculatedEtas[0].distanceKm,
          }
        : undefined,
      etaToNextStopSeconds: calculatedEtas[0]?.etaMinutes ? calculatedEtas[0].etaMinutes * 60 : undefined,
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
    broadcastBusUpdate(collegeId, created);

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

    const updates: Partial<BusRecord> = {};
    if (req.body.busNumber) updates.bus_number = req.body.busNumber;
    if (req.body.plateNumber) updates.plate_number = req.body.plateNumber;
    if (req.body.capacity) updates.capacity = Number(req.body.capacity);
    if (req.body.model) updates.model = req.body.model;
    if (req.body.currentRouteId !== undefined) updates.current_route_id = req.body.currentRouteId;
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
    if (updates.status !== undefined && ['OFFLINE', 'MAINTENANCE', 'IDLE'].includes(updates.status)) {
      const activeTrip = await db.getActiveTripForBus(busId, collegeId);
      if (activeTrip) {
        res.status(409).json({
          error: `Cannot deactivate or set bus to ${updates.status} while an active trip is in progress. Complete or cancel the active trip first.`,
        });
        return;
      }
    }

    const updated = await db.updateBus(busId, collegeId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Bus not found.' });
      return;
    }

    broadcastBusUpdate(collegeId, updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update bus.' });
  }
});

// DELETE /api/buses/:id (Admin Only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const busId = req.params.id;

    // 1. Check for active trip
    const activeTrip = await db.getActiveTripForBus(busId, collegeId);
    if (activeTrip) {
      res.status(409).json({
        error: 'Cannot delete bus while an active trip is currently in progress. End the active trip first.',
      });
      return;
    }

    // 2. Prevent destructive deletion if referenced by historical records
    const trips = await db.getTrips(collegeId);
    const busTrips = trips.filter((t) => t.bus_id === busId);
    if (busTrips.length > 0) {
      res.status(409).json({
        error: `Cannot delete bus referenced by historical records (${busTrips.length} past trip(s) recorded). Set status to OFFLINE or MAINTENANCE instead.`,
      });
      return;
    }

    const deleted = await db.deleteBus(busId, collegeId);
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
