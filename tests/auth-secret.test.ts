import { describe, it, expect, afterEach } from 'vitest';
import { getJwtSecret, signToken, verifyToken } from '../server/middleware/auth';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe('JWT secret handling', () => {
  it('throws in production when JWT_SECRET is missing or short', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET environment variable is missing/);
    process.env.JWT_SECRET = 'too-short';
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });
  it('uses a configured strong secret', () => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    expect(getJwtSecret()).toBe('x'.repeat(40));
  });
  it('never falls back to a committed default outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const s = getJwtSecret();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).not.toMatch(/campusmove_production_fallback/);
  });
  it('rejects tokens signed with a known former fallback secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    process.env.JWT_SECRET = 'y'.repeat(48);
    const forged = jwt.sign({ userId: 'u', collegeId: 'c', role: 'ADMIN', email: 'a@b', name: 'n' },
      'campusmove_production_fallback_jwt_secret_key_minimum_64_characters_long_for_serverless_deployments');
    expect(verifyToken(forged)).toBeNull();
    const ok = signToken({ userId: 'u', collegeId: 'c', role: 'STUDENT', email: 'a@b', name: 'n' });
    expect(verifyToken(ok)?.role).toBe('STUDENT');
  });
});
