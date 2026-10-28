import { Router, Response } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { broadcastBusUpdate } from '../socket';

const router = Router();

// GET /api/assignments (Admin and Authorized Staff)
router.get('/', requireAuth, requireRole(['ADMIN', 'DRIVER']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const buses = await db.getBuses(collegeId);
    const routes = await db.getRoutes(collegeId);
    const users = await db.getUsersByCollege(collegeId, 'DRIVER');

    const assignments = await Promise.all(
      buses
        .filter((b) => b.current_driver_id || b.current_route_id)
        .map(async (bus) => {
          const driver = bus.current_driver_id ? users.find((u) => u.id === bus.current_driver_id) : null;
          const route = bus.current_route_id ? routes.find((r) => r.id === bus.current_route_id) : null;
          const activeTrip = await db.getActiveTripForBus(bus.id, collegeId);

          return {
            id: bus.id,
            busId: bus.id,
            busNumber: bus.bus_number,
            plateNumber: bus.plate_number,
            capacity: bus.capacity,
            driverId: bus.current_driver_id || null,
            driverName: driver?.name || bus.driver_name || 'Unassigned',
            driverPhone: driver?.phone || null,
            driverCdl: driver?.cdl_number || null,
            routeId: bus.current_route_id || null,
            routeName: route?.name || null,
            routeCode: route?.code || null,
            routeColor: route?.color || '#2563EB',
            status: activeTrip ? 'ACTIVE_TRIP' : bus.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'ASSIGNED',
            activeTripId: activeTrip?.id || null,
            updatedAt: bus.updated_at,
          };
        })
    );

    res.json(assignments);
  } catch (err: any) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
});

// POST /api/assignments (Admin Only - Assign Driver + Bus + Route)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const { busId, driverId, routeId, shift } = req.body;

    if (!busId || !driverId || !routeId) {
      res.status(400).json({ error: 'busId, driverId, and routeId are required to establish an assignment.' });
      return;
    }

    // 1. Validate Bus
    const bus = await db.getBusById(busId, collegeId);
    if (!bus) {
      res.status(404).json({ error: 'Bus not found in your college fleet.' });
      return;
    }

    // Reject assigning if bus has an active trip in progress with another driver
    const activeBusTrip = await db.getActiveTripForBus(busId, collegeId);
    if (activeBusTrip && activeBusTrip.driver_id !== driverId) {
      res.status(409).json({
        error: `Bus ${bus.bus_number} currently has an active trip in progress by another driver. Wait for the trip to complete before reassigning.`,
      });
      return;
    }

    // 2. Validate Driver
    const driver = await db.getUserById(driverId);
    if (!driver || driver.college_id !== collegeId) {
      res.status(404).json({ error: 'Driver account not found in your college.' });
      return;
    }
    if (driver.role !== 'DRIVER') {
      res.status(400).json({ error: 'Selected user is not certified as a DRIVER.' });
      return;
    }
    if (driver.status === 'DEACTIVATED') {
      res.status(400).json({ error: 'Cannot assign a deactivated driver.' });
      return;
    }

    // Reject simultaneous conflicting assignments: check if driver is currently in an active trip on another bus
    const activeDriverTrip = await db.getActiveTripForDriver(driverId, collegeId);
    if (activeDriverTrip && activeDriverTrip.bus_id !== busId) {
      res.status(409).json({
        error: `Driver ${driver.name} is currently operating an active trip on another bus. Complete or end the active trip first.`,
      });
      return;
    }

    // 3. Validate Route
    const route = await db.getRouteById(routeId, collegeId);
    if (!route) {
      res.status(404).json({ error: 'Route not found in your college transit network.' });
      return;
    }

    // If driver was previously assigned to a different bus, unassign it to prevent ghost duplicates
    const allBuses = await db.getBuses(collegeId);
    for (const otherBus of allBuses) {
      if (otherBus.id !== busId && otherBus.current_driver_id === driverId) {
        await db.updateBus(otherBus.id, collegeId, {
          current_driver_id: undefined,
          driver_name: undefined,
        });
        broadcastBusUpdate(collegeId, {
          ...otherBus,
          current_driver_id: undefined,
          driver_name: undefined,
        });
      }
    }

    // Save the new assignment onto the bus record
    const updatedBus = await db.updateBus(busId, collegeId, {
      current_driver_id: driverId,
      driver_name: driver.name,
      current_route_id: routeId,
      status: bus.status === 'MAINTENANCE' ? 'MAINTENANCE' : bus.status === 'ACTIVE' ? 'ACTIVE' : 'IDLE',
    });

    if (updatedBus) {
      broadcastBusUpdate(collegeId, updatedBus);
    }

    res.status(201).json({
      success: true,
      assignment: {
        busId,
        busNumber: bus.bus_number,
        driverId,
        driverName: driver.name,
        routeId,
        routeName: route.name,
        routeCode: route.code,
        shift: shift || 'Standard',
      },
    });
  } catch (err: any) {
    console.error('Error creating assignment:', err);
    res.status(500).json({ error: 'Failed to create assignment.' });
  }
});

// DELETE /api/assignments/:busId (Admin Only - Deactivate/Unassign)
router.delete('/:busId', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const busId = req.params.busId;

    const bus = await db.getBusById(busId, collegeId);
    if (!bus) {
      res.status(404).json({ error: 'Bus not found.' });
      return;
    }

    // Prevent unassigning if trip is currently in progress
    const activeTrip = await db.getActiveTripForBus(busId, collegeId);
    if (activeTrip) {
      res.status(409).json({
        error: `Cannot unassign bus ${bus.bus_number} while an active trip is in progress. End the trip before unassigning.`,
      });
      return;
    }

    const updatedBus = await db.updateBus(busId, collegeId, {
      current_driver_id: undefined,
      driver_name: undefined,
      current_route_id: undefined,
      status: bus.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'IDLE',
    });

    if (updatedBus) {
      broadcastBusUpdate(collegeId, updatedBus);
    }

    res.json({ success: true, message: `Assignment cleared for bus ${bus.bus_number}.` });
  } catch (err: any) {
    console.error('Error clearing assignment:', err);
    res.status(500).json({ error: 'Failed to clear assignment.' });
  }
});

export default router;
