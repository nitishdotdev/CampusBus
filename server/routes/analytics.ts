import { Router, Response } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/analytics
router.get('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const analytics = await db.getAnalytics(collegeId);
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute analytics.' });
  }
});

export default router;
