import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../src/auth/service';
import { createApp } from '../src/http/app';
import { signAccessToken, verifyAccessToken } from '../src/auth/tokens';
import type { Principal, UserDTO, UserRepository } from '../src/domain/types';

const CAMPUS_A = 'a'.repeat(24);
const CAMPUS_B = 'c'.repeat(24);
const ADMIN_ID = '4'.repeat(24);
const STUDENT_ID = '3'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';
const REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-1234567';

function token(p: Principal) {
  return signAccessToken(p, SECRET);
}

function unusedDeps() {
  return {
    ingest: { ingest: async () => ({}) },
    trips: { start: async () => ({}), end: async () => ({}) },
    live: { snapshot: async () => ({}) },
    buses: {},
    routes: {},
    tripRepo: {},
  } as any;
}

describe('POST /api/v1/users/drivers', () => {
  it('refuses unauthenticated and non-admin callers', async () => {
    const app = createApp({
      ...unusedDeps(),
      auth: { createDriver: async () => ({}) } as any,
      users: {} as any,
      verifyToken: (t: string) => verifyAccessToken(t, SECRET),
      allowedOrigins: [],
    });
    expect((await request(app).post('/api/v1/users/drivers').send({
      email: 'd@t.test', password: 'Password1!', name: 'Dee',
    })).status).toBe(401);

    const student = await request(app)
      .post('/api/v1/users/drivers')
      .set('Authorization', `Bearer ${token({ userId: STUDENT_ID, campusId: CAMPUS_A, role: 'STUDENT' })}`)
      .send({ email: 'd@t.test', password: 'Password1!', name: 'Dee' });
    expect(student.status).toBe(403);
  });

  it('admin creates an ACTIVE driver in the token campus and ignores body.campusId', async () => {
    const created: unknown[] = [];
    const app = createApp({
      ...unusedDeps(),
      auth: {
        createDriver: async (p: Principal, body: unknown) => {
          created.push({ principal: p, body });
          return { userId: '2'.repeat(24), campusId: p.campusId, role: 'DRIVER', name: 'Dee', email: 'dee@t.test', status: 'ACTIVE' };
        },
      } as any,
      users: {} as any,
      verifyToken: (t: string) => verifyAccessToken(t, SECRET),
      allowedOrigins: [],
    });
    const res = await request(app)
      .post('/api/v1/users/drivers')
      .set('Authorization', `Bearer ${token({ userId: ADMIN_ID, campusId: CAMPUS_A, role: 'ADMIN' })}`)
      .send({ email: 'dee@t.test', password: 'Password1!', name: 'Dee', campusId: CAMPUS_B, role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.status).toBe('ACTIVE');
    expect(res.body.user.role).toBe('DRIVER');
    expect(res.body.user.campusId).toBe(CAMPUS_A);
    expect(created).toHaveLength(1);
    expect((created[0] as { principal: Principal }).principal.campusId).toBe(CAMPUS_A);
  });
});

describe('AuthService.createDriver', () => {
  it('hashes the password and stores an ACTIVE DRIVER in the admin campus', async () => {
    const stored: UserDTO[] = [];
    const users: UserRepository = {
      findById: async () => null,
      findByEmail: async () => null,
      create: async (u) => {
        const dto: UserDTO = {
          id: '2'.repeat(24), campusId: u.campusId, email: u.email, name: u.name,
          role: u.role, status: u.status, emailVerifiedAt: null,
        };
        stored.push(dto);
        expect(u.passwordHash).toMatch(/^\$argon2/);
        expect(u.passwordHash).not.toContain('Password1!');
        return dto;
      },
      updateStatus: async () => true,
      verifyEmail: async () => true,
      updatePassword: async () => true,
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      assignTransport: async () => true,
    };
    const auth = new AuthService({
      users,
      refreshTokens: { create: async () => 'x', find: async () => null, revoke: async () => {}, revokeFamily: async () => {}, revokeAll: async () => {}, purgeExpired: async () => 0 },
      emailTokens: { upsert: async () => {}, find: async () => null, markUsed: async () => {} },
      email: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
      config: {
        ...DEFAULT_AUTH_CONFIG,
        env: { ACCESS_TOKEN_SECRET: SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv,
      },
    });
    const user = await auth.createDriver(
      { userId: ADMIN_ID, campusId: CAMPUS_A, role: 'ADMIN' },
      { email: 'dee@t.test', password: 'Password1!', name: 'Dee Driver' },
    );
    expect(user).toMatchObject({ role: 'DRIVER', status: 'ACTIVE', campusId: CAMPUS_A, email: 'dee@t.test' });
    expect(stored).toHaveLength(1);
  });

  it('rejects extra identity fields and non-admin principals', async () => {
    const auth = new AuthService({
      users: { create: async () => { throw new Error('must not create'); } } as any,
      refreshTokens: { create: async () => 'x', find: async () => null, revoke: async () => {}, revokeFamily: async () => {}, revokeAll: async () => {}, purgeExpired: async () => 0 },
      emailTokens: { upsert: async () => {}, find: async () => null, markUsed: async () => {} },
      email: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
      config: {
        ...DEFAULT_AUTH_CONFIG,
        env: { ACCESS_TOKEN_SECRET: SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv,
      },
    });
    await expect(auth.createDriver(
      { userId: STUDENT_ID, campusId: CAMPUS_A, role: 'STUDENT' },
      { email: 'dee@t.test', password: 'Password1!', name: 'Dee' },
    )).rejects.toMatchObject({ status: 403 });
    await expect(auth.createDriver(
      { userId: ADMIN_ID, campusId: CAMPUS_A, role: 'ADMIN' },
      { email: 'dee@t.test', password: 'Password1!', name: 'Dee', campusId: CAMPUS_B, role: 'ADMIN' },
    )).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });
});
