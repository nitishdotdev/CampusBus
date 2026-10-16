import { Router, Response } from 'express';
import { db, ComplaintRecord } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/complaints - List complaints
// Students see only their own; Admins see all for their college
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const status = req.query.status as string | undefined;

    let complaints: ComplaintRecord[];

    if (role === 'ADMIN') {
      // Admins see all complaints for their college
      complaints = await db.getComplaints(collegeId, undefined, status);
    } else if (role === 'STUDENT') {
      // Students see only their own complaints
      complaints = await db.getComplaints(collegeId, userId, status);
    } else {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    res.json(complaints);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch complaints.' });
  }
});

// GET /api/complaints/:id - Get single complaint
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const complaint = await db.getComplaintById(req.params.id, collegeId);

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    // Students can only view their own complaints; Admins can view any in their college
    if (role === 'STUDENT' && complaint.student_id !== userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    res.json(complaint);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch complaint.' });
  }
});

// POST /api/complaints - Create complaint (STUDENT only)
router.post('/', requireAuth, requireRole(['STUDENT']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const studentId = req.user!.userId;
    const { title, description, category, tripId, busId, routeId, priority } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }

    // Optional: Verify referenced resources belong to this college
    if (busId) {
      const bus = await db.getBusById(busId, collegeId);
      if (!bus) {
        res.status(404).json({ error: 'Bus not found.' });
        return;
      }
    }

    if (routeId) {
      const route = await db.getRouteById(routeId, collegeId);
      if (!route) {
        res.status(404).json({ error: 'Route not found.' });
        return;
      }
    }

    const complaint: ComplaintRecord = {
      id: 'cmp_' + Date.now().toString() + Math.random().toString(36).substr(2, 9),
      college_id: collegeId,
      student_id: studentId,
      trip_id: tripId || undefined,
      bus_id: busId || undefined,
      route_id: routeId || undefined,
      title: title.trim(),
      description: description.trim(),
      category: category || 'OTHER',
      status: 'OPEN',
      priority: priority || 'NORMAL',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const created = await db.createComplaint(complaint);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create complaint.' });
  }
});

// PUT /api/complaints/:id - Update complaint status and add admin response (ADMIN only)
router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const adminId = req.user!.userId;
    const { status, adminResponse, priority } = req.body;

    const existing = await db.getComplaintById(req.params.id, collegeId);
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const updates: Partial<ComplaintRecord> = {};
    if (status !== undefined && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      updates.status = status;
    }
    if (priority !== undefined && ['LOW', 'NORMAL', 'HIGH'].includes(priority)) {
      updates.priority = priority;
    }
    if (adminResponse !== undefined) {
      updates.admin_response = adminResponse;
      updates.admin_id = adminId;
      updates.responded_at = new Date().toISOString();
    }

    const updated = await db.updateComplaint(req.params.id, collegeId, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update complaint.' });
  }
});

// DELETE /api/complaints/:id - Delete complaint (ADMIN only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;

    const existing = await db.getComplaintById(req.params.id, collegeId);
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const deleted = await db.deleteComplaint(req.params.id, collegeId);
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(500).json({ error: 'Failed to delete complaint.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete complaint.' });
  }
});

export default router;
