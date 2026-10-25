import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, UserRecord } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/users (Admin Only - Scoped to college)
router.get('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const roleFilter = req.query.role as string | undefined;

    const users = await db.getUsersByCollege(collegeId, roleFilter);
    const buses = await db.getBuses(collegeId);
    const routes = await db.getRoutes(collegeId);

    const sanitized = users.map((u) => {
      const assignedBus = buses.find((b) => b.current_driver_id === u.id);
      const assignedRoute = assignedBus?.current_route_id
        ? routes.find((r) => r.id === assignedBus.current_route_id)
        : null;

      return {
        id: u.id,
        collegeId: u.college_id,
        email: u.email,
        name: u.name,
        role: u.role,
        studentId: u.student_id,
        cdlNumber: u.cdl_number,
        phone: u.phone,
        status: u.status,
        createdAt: u.created_at,
        assignedBusId: assignedBus?.id || null,
        assignedBusNumber: assignedBus?.bus_number || null,
        assignedRouteId: assignedRoute?.id || null,
        assignedRouteName: assignedRoute?.name || null,
        assignedRouteCode: assignedRoute?.code || null,
      };
    });

    res.json(sanitized);
  } catch (err: any) {
    console.error('Error fetching directory users:', err);
    res.status(500).json({ error: 'Failed to fetch directory accounts.' });
  }
});

// POST /api/users/drivers (Admin Only - Provision Driver Account)
router.post('/drivers', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const { email, password, name, phone, cdlNumber } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Name, institutional email, and password are required.' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email address is already registered.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const driverId = 'usr_driver_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const newDriver: UserRecord = {
      id: driverId,
      college_id: collegeId,
      email: normalizedEmail,
      password_hash: hashedPassword,
      name: name.trim(),
      role: 'DRIVER',
      phone: phone?.trim() || undefined,
      cdl_number: cdlNumber?.trim() || undefined,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    await db.createUser(newDriver);

    res.status(201).json({
      success: true,
      user: {
        id: newDriver.id,
        collegeId: newDriver.college_id,
        email: newDriver.email,
        name: newDriver.name,
        role: newDriver.role,
        phone: newDriver.phone,
        cdlNumber: newDriver.cdl_number,
        status: newDriver.status,
        createdAt: newDriver.created_at,
      },
    });
  } catch (err: any) {
    console.error('Error creating driver account:', err);
    res.status(500).json({ error: 'Failed to create driver account.' });
  }
});

// PUT /api/users/:id (Admin Only - Update user details or status)
router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const userId = req.params.id;
    const { name, phone, cdlNumber, studentId, status } = req.body;

    const user = await db.getUserById(userId);
    if (!user || user.college_id !== collegeId) {
      res.status(404).json({ error: 'User record not found in your institution.' });
      return;
    }

    const updates: Partial<UserRecord> = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone?.trim();
    if (cdlNumber !== undefined) updates.cdl_number = cdlNumber?.trim();
    if (studentId !== undefined) updates.student_id = studentId?.trim();
    if (status && ['ACTIVE', 'DEACTIVATED'].includes(status)) {
      updates.status = status;

      // If driver is deactivated, unassign any assigned bus
      if (status === 'DEACTIVATED' && user.role === 'DRIVER') {
        const buses = await db.getBuses(collegeId);
        const assignedBus = buses.find((b) => b.current_driver_id === userId);
        if (assignedBus) {
          await db.updateBus(assignedBus.id, collegeId, {
            current_driver_id: undefined,
            driver_name: undefined,
          });
        }
      }
    }

    const updated = await db.updateUser(userId, collegeId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Failed to update user record.' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: updated.id,
        collegeId: updated.college_id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        phone: updated.phone,
        cdlNumber: updated.cdl_number,
        studentId: updated.student_id,
        status: updated.status,
        createdAt: updated.created_at,
      },
    });
  } catch (err: any) {
    console.error('Error updating user record:', err);
    res.status(500).json({ error: 'Failed to update user record.' });
  }
});

// POST /api/users/:id/reset-password (Admin Only - Reset credentials)
router.post('/:id/reset-password', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    const user = await db.getUserById(userId);
    if (!user || user.college_id !== collegeId) {
      res.status(404).json({ error: 'User record not found in your institution.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(userId, collegeId, { password_hash: hashedPassword });

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err: any) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset user password.' });
  }
});

// DELETE /api/users/:id (Admin Only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const userId = req.params.id;

    const user = await db.getUserById(userId);
    if (!user || user.college_id !== collegeId) {
      res.status(404).json({ error: 'User record not found in your institution.' });
      return;
    }

    // Prevent deleting driver during active trip
    if (user.role === 'DRIVER') {
      const activeTrip = await db.getActiveTripForDriver(userId, collegeId);
      if (activeTrip) {
        res.status(409).json({ error: 'Cannot delete driver while an active trip is in progress. End the trip first.' });
        return;
      }
    }

    const deleted = await db.deleteUser(userId, collegeId);
    if (!deleted) {
      res.status(404).json({ error: 'Failed to delete user.' });
      return;
    }

    res.json({ success: true, message: 'User account removed.' });
  } catch (err: any) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

export default router;
