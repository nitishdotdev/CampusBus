import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, UserRecord } from '../db';
import { signToken, requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register (User Registration - Task 2.7)
router.post('/register', async (req, res): Promise<void> => {
  try {
    const { email, password, name, role, collegeId, studentId, cdlNumber, phone } = req.body;

    // Validate inputs
    if (!email || !password || !name || !role || !collegeId) {
      res.status(400).json({
        error: 'email, password, name, role, and collegeId are required.',
      });
      return;
    }

    if (role !== 'STUDENT') {
      res.status(403).json({
        error: 'Only students can self-register. Driver and admin accounts are created by campus administrators.',
      });
      return;
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    // Check college exists
    const college = await db.getCollegeById(collegeId);
    if (!college) {
      res.status(404).json({ error: 'College not found.' });
      return;
    }

    // Check email already registered
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const newUser: UserRecord = {
      id: userId,
      college_id: collegeId,
      email: normalizedEmail,
      password_hash: hashedPassword,
      name: name.trim(),
      role: role as 'STUDENT' | 'DRIVER' | 'ADMIN',
      student_id: studentId || undefined,
      cdl_number: cdlNumber || undefined,
      phone: phone || undefined,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    await db.createUser(newUser);

    // Issue token
    const token = signToken({
      userId,
      collegeId,
      role: newUser.role,
      email: newUser.email,
      name: newUser.name,
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        collegeId,
        collegeName: college.name,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        studentId: newUser.student_id,
        cdlNumber: newUser.cdl_number,
        phone: newUser.phone,
        status: 'ACTIVE',
      },
      college,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Valid institutional email is required.' });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const normalized = email.trim().toLowerCase();
    const user = await db.getUserByEmail(normalized);

    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.status === 'DEACTIVATED') {
      res.status(403).json({ error: 'This account has been deactivated. Please contact your campus transit administrator.' });
      return;
    }

    const token = signToken({
      userId: user.id,
      collegeId: user.college_id,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const college = await db.getCollegeById(user.college_id);

    res.json({
      token,
      user: {
        id: user.id,
        collegeId: user.college_id,
        collegeName: college?.name || 'Apex State University',
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        cdlNumber: user.cdl_number,
        phone: user.phone,
        status: user.status,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal authentication error.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await db.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User record not found.' });
      return;
    }

    const college = await db.getCollegeById(user.college_id);

    res.json({
      user: {
        id: user.id,
        collegeId: user.college_id,
        collegeName: college?.name || 'Apex State University',
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        cdlNumber: user.cdl_number,
        phone: user.phone,
        status: user.status,
      },
      college,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

async function handlePasswordChange(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    const dbUser = await db.getUserById(req.user.userId);
    if (!dbUser || !dbUser.password_hash) {
      res.status(404).json({ error: 'User record not found.' });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!matches) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(dbUser.id, req.user.collegeId, { password_hash: hashedPassword });
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
}

router.put('/password', requireAuth, handlePasswordChange);
router.post('/change-password', requireAuth, handlePasswordChange);

// GET /api/auth/demo-accounts (Development only)
router.get('/demo-accounts', async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Endpoint not available in production.' });
    return;
  }

  res.json([
    { role: 'STUDENT', name: 'Alex Chen', email: 'alex.chen@apex.edu', hint: 'View live bus map, routes & honest ETAs' },
    { role: 'DRIVER', name: 'Marcus Vance', email: 'marcus.vance@transit.apex.edu', hint: 'Real phone GPS tracking & offline queue sync' },
    { role: 'ADMIN', name: 'Sarah Jenkins', email: 'admin@apex.edu', hint: 'Fleet monitoring, emergency dispatch & announcements' },
  ]);
});

export default router;
