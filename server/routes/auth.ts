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
        collegeName: college?.name || '',
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
        collegeName: college?.name || '',
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

// PUT /api/auth/password
router.put('/password', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const user = await db.getUserById(req.user.userId);
    if (!user || !user.password_hash) {
      res.status(404).json({ error: 'User record not found.' });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(user.id, { password_hash: hashedPassword });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

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

// POST /api/auth/bootstrap-admin
// Creates the first campus + first ADMIN when no admin exists.
// Requires BOOTSTRAP_SECRET. Remove the secret after first use.
router.post('/bootstrap-admin', async (req, res): Promise<void> => {
  try {
    const secret = process.env.BOOTSTRAP_SECRET;
    if (!secret) {
      res.status(404).json({ error: 'Bootstrap is not enabled.' });
      return;
    }
    const provided = req.headers['x-bootstrap-secret'];
    if (typeof provided !== 'string' || provided !== secret) {
      res.status(403).json({ error: 'Invalid bootstrap secret.' });
      return;
    }

    const existingAdmins = await db.countAdmins();
    if (existingAdmins > 0) {
      res.status(409).json({ error: 'An administrator already exists. Bootstrap is closed.' });
      return;
    }

    const { email, password, name, collegeName, collegeShortCode, collegeDomain } = req.body ?? {};
    if (!email || !password || !name) {
      res.status(400).json({ error: 'email, password, and name are required.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const colleges = await db.getColleges();
    let college = colleges[0] ?? null;
    if (!college) {
      const now = new Date().toISOString();
      const short = String(collegeShortCode || 'CAMPUS').trim().toUpperCase().slice(0, 32);
      college = await db.createCollege({
        id: 'college_' + Date.now().toString(36),
        name: String(collegeName || 'Campus').trim(),
        short_code: short,
        domain: String(collegeDomain || 'campus.local').trim(),
        center_lat: 0,
        center_lng: 0,
        zoom_level: 15,
        settings: {},
        created_at: now,
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const admin: UserRecord = {
      id: userId,
      college_id: college.id,
      email: normalizedEmail,
      password_hash: hashedPassword,
      name: String(name).trim(),
      role: 'ADMIN',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    await db.createUser(admin);

    res.status(201).json({
      success: true,
      user: {
        id: admin.id,
        collegeId: admin.college_id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        status: admin.status,
      },
      college: {
        id: college.id,
        name: college.name,
        shortCode: college.short_code,
      },
    });
  } catch (err: any) {
    console.error('Bootstrap admin error:', err);
    res.status(500).json({ error: 'Failed to bootstrap administrator.' });
  }
});

export default router;
