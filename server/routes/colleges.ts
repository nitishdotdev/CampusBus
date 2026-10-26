import { Router, Request, Response } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

function publicCollege(college: {
  id: string;
  name: string;
  short_code: string;
  domain: string;
  center_lat: number;
  center_lng: number;
  zoom_level: number;
  settings?: Record<string, any>;
}) {
  return {
    id: college.id,
    name: college.name,
    shortCode: college.short_code,
    domain: college.domain,
    campusName: college.name,
    centerLocation: { lat: college.center_lat, lng: college.center_lng },
    defaultZoom: college.zoom_level,
    timezone: college.settings?.timeZone || 'UTC',
    settings: college.settings || {},
  };
}

// GET /api/colleges
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const colleges = await db.getColleges();
    res.json(colleges.map(publicCollege));
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
    res.json(publicCollege(college));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch college details.' });
  }
});

router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const nextSettings = req.body.settings
      ? { ...existing.settings, ...req.body.settings }
      : existing.settings;

    const updated = await db.updateCollege(collegeId, {
      name: req.body.name?.trim() || existing.name,
      settings: nextSettings,
    });
    if (!updated) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }
    res.json(publicCollege(updated));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update campus settings.' });
  }
});

export default router;
