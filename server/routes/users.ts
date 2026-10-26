import { Router, Response } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

function publicUser(user: {
  id: string;
  college_id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
  student_id?: string;
  cdl_number?: string;
  phone?: string;
  status: string;
  created_at: string;
}) {
  return {
    id: user.id,
    collegeId: user.college_id,
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.student_id,
    cdlNumber: user.cdl_number,
    phone: user.phone,
    status: user.status,
    createdAt: user.created_at,
  };
}

router.get('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const users = await db.getUsersByCollege(collegeId, role);
    res.json(users.map(publicUser));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

export default router;
