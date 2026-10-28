import { Router, Request, Response } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, enforceTenantIsolation, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/colleges
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const colleges = await db.getColleges();
    res.json(colleges);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch colleges.' });
  }
});

// GET /api/colleges/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const college = await db.getCollegeById(req.params.id);
    if (!college) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }
    res.json(college);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch college details.' });
  }
});

router.put('/:id', requireAuth, requireRole(['ADMIN']), enforceTenantIsolation, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    if (req.params.id !== collegeId) {
      res.status(403).json({ error: 'You can only update your own campus settings.' });
      return;
    }

    const existing = await db.getCollegeById(collegeId);
    if (!existing) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }

    const { name, domain, centerLat, centerLng, zoomLevel, settings } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (domain) updates.domain = domain.trim();
    if (centerLat !== undefined) updates.center_lat = Number(centerLat);
    if (centerLng !== undefined) updates.center_lng = Number(centerLng);
    if (zoomLevel !== undefined) updates.zoom_level = Number(zoomLevel);
    if (settings !== undefined) {
      updates.settings = { ...existing.settings, ...settings };
    }

    const updated = await db.updateCollege(collegeId, updates);
    if (!updated) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    console.error('Failed to update college settings:', err);
    res.status(500).json({ error: 'Failed to update campus settings.' });
  }
});

export default router;
