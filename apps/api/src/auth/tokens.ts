import jwt from 'jsonwebtoken';
import type { Principal, Role } from '../domain/types';

const ISSUER = 'campusmove';
const AUDIENCE = 'campusmove-api';
const ROLES: Role[] = ['STUDENT', 'DRIVER', 'ADMIN'];

/** No development fallback: the API refuses to run without a strong secret. */
export function requireAccessSecret(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.ACCESS_TOKEN_SECRET;
  if (!s || s.length < 32) throw new Error('FATAL: ACCESS_TOKEN_SECRET must be set to at least 32 characters.');
  return s;
}

export function signAccessToken(p: Principal, secret: string, ttlSeconds = 900): string {
  return jwt.sign({ campusId: p.campusId, role: p.role }, secret, {
    algorithm: 'HS256', subject: p.userId, issuer: ISSUER, audience: AUDIENCE, expiresIn: ttlSeconds,
  });
}

export type VerifiedPrincipal = Principal & { exp: number };

export function verifyAccessToken(token: string, secret: string): VerifiedPrincipal | null {
  try {
    const c = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    if (!c.sub || typeof c.campusId !== 'string' || !ROLES.includes(c.role as Role) || typeof c.exp !== 'number') return null;
    return { userId: c.sub, campusId: c.campusId, role: c.role as Role, exp: c.exp };
  } catch {
    return null;
  }
}
