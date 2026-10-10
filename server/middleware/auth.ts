import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import crypto from 'crypto';

const MIN_SECRET_LENGTH = 32;
let ephemeralDevSecret: string | null = null;

/**
 * Returns the JWT signing secret.
 * - A configured JWT_SECRET (>= 32 chars) is always used.
 * - In production a missing or weak secret is a fatal error. There is no default.
 * - Outside production a random per-process secret is generated, so tokens are
 *   invalidated on restart and no secret is ever committed to source control.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length >= MIN_SECRET_LENGTH) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `FATAL: JWT_SECRET environment variable is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
        'Set a high-entropy secret (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`).'
    );
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[auth] JWT_SECRET not set; using a random per-process secret (development only).');
  }
  return ephemeralDevSecret;
}

export interface AuthenticatedUser {
  userId: string;
  collegeId: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function signToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      collegeId: user.collegeId,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): AuthenticatedUser | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthenticatedUser;
  } catch (err) {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  req.user = decoded;
  next();
}

export function requireRole(allowedRoles: ('STUDENT' | 'DRIVER' | 'ADMIN')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access forbidden: role '${req.user.role}' is not authorized for this endpoint. Required: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}

export function enforceTenantIsolation(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // If request targets a specific college ID parameter or body field, enforce match with user's college
  const targetCollegeId = req.params.collegeId || req.query.collegeId || req.body?.collegeId;

  if (targetCollegeId && targetCollegeId !== req.user.collegeId) {
    res.status(403).json({
      error: `Multi-Tenant Isolation Breach: You cannot access operational transportation data of college '${targetCollegeId}' with credentials from '${req.user.collegeId}'.`,
    });
    return;
  }

  next();
}
