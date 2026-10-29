import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../src/auth/service';
import { hashPassword } from '../src/auth/passwords';
import { createApp } from '../src/http/app';
import type {
  EmailTokenRepository, RefreshTokenRepository, UserDTO, UserRepository,
} from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const USER_ID = 'b'.repeat(24);
const ACCESS_SECRET = 'test-access-secret-test-access-secret-12345678';
const REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-1234567';

type StoredUser = UserDTO & { passwordHash: string };

async function makeAuth() {
  const passwordHash = await hashPassword('Password1!');
  const stored: StoredUser = {
    id: USER_ID,
    campusId: CAMPUS,
    email: 'alex.chen@apex.edu',
    name: 'Alex Chen',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordHash,
  };

  const refreshStore = new Map<string, {
    id: string; userId: string; campusId: string; familyId: string;
    expiresAt: Date; revokedAt: Date | null; previousId: string | null;
  }>();
  let seq = 0;

  const users: UserRepository = {
    findById: async (campusId, id) => (campusId === stored.campusId && id === stored.id ? stored : null),
    findByEmail: async (campusId, email) =>
      (campusId === stored.campusId && email === stored.email ? stored : null),
    create: async () => stored,
    updateStatus: async () => true,
    verifyEmail: async () => true,
    updatePassword: async () => true,
    list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    assignTransport: async () => true,
  };

  const refreshTokens: RefreshTokenRepository = {
    create: async (t) => {
      const id = `rt_${++seq}`;
      refreshStore.set(t.tokenHash, {
        id, userId: t.userId, campusId: t.campusId, familyId: t.familyId,
        expiresAt: t.expiresAt, revokedAt: null, previousId: t.previousId ?? null,
      });
      return id;
    },
    find: async (tokenHash) => refreshStore.get(tokenHash) ?? null,
    revoke: async (id, at) => {
      for (const rec of refreshStore.values()) if (rec.id === id) rec.revokedAt = at;
    },
    revokeFamily: async (familyId, at) => {
      for (const rec of refreshStore.values()) if (rec.familyId === familyId && !rec.revokedAt) rec.revokedAt = at;
    },
    revokeAll: async (userId, at) => {
      for (const rec of refreshStore.values()) if (rec.userId === userId && !rec.revokedAt) rec.revokedAt = at;
    },
    purgeExpired: async () => 0,
  };

  const emailTokens: EmailTokenRepository = {
    upsert: async () => {},
    find: async () => null,
    markUsed: async () => {},
  };

  const auth = new AuthService({
    users,
    refreshTokens,
    emailTokens,
    email: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: {
      ...DEFAULT_AUTH_CONFIG,
      env: { ACCESS_TOKEN_SECRET: ACCESS_SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv,
    },
  });

  return { auth, users };
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

describe('login / refresh token contract (SPA)', () => {
  it('login returns a raw refreshToken the SPA stores via data.refreshToken', async () => {
    const { auth } = await makeAuth();
    const result = await auth.login({
      campusId: CAMPUS, email: 'alex.chen@apex.edu', password: 'Password1!',
    });
    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.tokens.expiresIn).toBe(900);
    expect(result.refreshToken).toEqual(expect.stringMatching(/^[a-f0-9]{96}$/));
    expect(result.user).toMatchObject({ email: 'alex.chen@apex.edu', role: 'STUDENT' });
  });

  it('POST /api/v1/auth/refresh returns tokens.accessToken plus rotated refreshToken', async () => {
    const { auth, users } = await makeAuth();
    const login = await auth.login({
      campusId: CAMPUS, email: 'alex.chen@apex.edu', password: 'Password1!',
    });

    const app = createApp({
      ...unusedDeps(),
      auth,
      users,
      verifyToken: () => null,
      allowedOrigins: [],
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.expiresIn).toBe(900);
    expect(res.body.refreshToken).toEqual(expect.stringMatching(/^[a-f0-9]{96}$/));
    expect(res.body.refreshToken).not.toBe(login.refreshToken);
  });
});
