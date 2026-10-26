import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, UserRecord } from '../db';
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

router.post('/', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const collegeId = req.user!.collegeId;
    const { email, password, name, role, studentId, cdlNumber, phone } = req.body ?? {};

    if (!email || !password || !name || !role) {
      res.status(400).json({ error: 'email, password, name, and role are required.' });
      return;
    }
    if (role !== 'DRIVER' && role !== 'ADMIN') {
      res.status(400).json({ error: 'Admins may only create DRIVER or ADMIN accounts. Students self-register.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const college = await db.getCollegeById(collegeId);
    if (!college) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const newUser: UserRecord = {
      id: userId,
      college_id: collegeId,
      email: normalizedEmail,
      password_hash: hashedPassword,
      name: String(name).trim(),
      role,
      student_id: studentId || undefined,
      cdl_number: cdlNumber || undefined,
      phone: phone || undefined,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    await db.createUser(newUser);
    res.status(201).json(publicUser(newUser));
  } catch (err: any) {
    console.error('Admin user create error:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

export default router;
