import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { requireAccessSecret, signAccessToken, verifyAccessToken } from '../src/auth/tokens';

const S = 'a-very-long-secret-for-tests-0123456789abcdef';
const base = { userId: 'u1', campusId: 'c1', role: 'DRIVER' as const };

describe('access tokens', () => {
  it('round-trips a principal', () => {
    expect(verifyAccessToken(signAccessToken(base, S), S)).toMatchObject(base);
  });
  it('rejects a different secret, expiry, other algorithms, "none", wrong issuer/audience and bad claims', () => {
    expect(verifyAccessToken(signAccessToken(base, S), S + 'x')).toBeNull();
    expect(verifyAccessToken(signAccessToken(base, S, -10), S)).toBeNull();
    const claims = { campusId: 'c1', role: 'DRIVER' };
    const opt = { subject: 'u1', issuer: 'campusmove', audience: 'campusmove-api', expiresIn: 60 } as const;
    expect(verifyAccessToken(jwt.sign(claims, S, { ...opt, algorithm: 'HS512' }), S)).toBeNull();
    expect(verifyAccessToken(jwt.sign(claims, '', { ...opt, algorithm: 'none' } as any), S)).toBeNull();
    expect(verifyAccessToken(jwt.sign(claims, S, { ...opt, algorithm: 'HS256', issuer: 'evil' }), S)).toBeNull();
    expect(verifyAccessToken(jwt.sign(claims, S, { ...opt, algorithm: 'HS256', audience: 'other' }), S)).toBeNull();
    expect(verifyAccessToken(jwt.sign({ campusId: 'c1', role: 'ROOT' }, S, { ...opt, algorithm: 'HS256' }), S)).toBeNull();
    expect(verifyAccessToken(jwt.sign({ role: 'DRIVER' }, S, { ...opt, algorithm: 'HS256' }), S)).toBeNull();
    expect(verifyAccessToken('a.b.c', S)).toBeNull();
  });
  it('the API refuses to start without a strong secret, in every environment', () => {
    expect(() => requireAccessSecret({} as any)).toThrow(/ACCESS_TOKEN_SECRET/);
    expect(() => requireAccessSecret({ ACCESS_TOKEN_SECRET: 'short', NODE_ENV: 'development' } as any)).toThrow();
    expect(requireAccessSecret({ ACCESS_TOKEN_SECRET: S } as any)).toBe(S);
  });
});
