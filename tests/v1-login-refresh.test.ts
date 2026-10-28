import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../apps/api/src/auth/service';
import { loginV1 } from '../src/services/v1/auth';
import { v1Token } from '../src/services/v1/client';

const ACCESS = 'a-very-long-secret-for-tests-0123456789abcdef';
const REFRESH = 'a-different-long-secret-for-tests-0123456789ab';
const CAMPUS = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function memoryAuth() {
  const users = new Map<string, any>();
  const tokens: any[] = [];
  let n = 0;
  const svc = new AuthService({
    users: {
      findById: async (_c, id) => users.get(id) ?? null,
      findByEmail: async (campusId, email) =>
        [...users.values()].find((u) => u.campusId === campusId && u.email === email) ?? null,
      create: async (u) => {
        const row = { ...u, id: 'u' + (++n), emailVerifiedAt: null };
        users.set(row.id, row);
        return row;
      },
      updateStatus: async () => true,
      verifyEmail: async () => true,
      updatePassword: async () => true,
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      assignTransport: async () => true,
    },
    refreshTokens: {
      create: async (t) => {
        const id = 'rt' + tokens.length;
        tokens.push({ id, ...t, revokedAt: null, previousId: t.previousId ?? null });
        return id;
      },
      find: async (tokenHash) => tokens.find((t) => t.tokenHash === tokenHash) ?? null,
      revoke: async (id, at) => {
        const t = tokens.find((x) => x.id === id);
        if (t) t.revokedAt = at;
      },
      revokeFamily: async () => {},
      revokeAll: async () => {},
      purgeExpired: async () => 0,
    },
    emailTokens: { upsert: async () => {}, find: async () => null, markUsed: async () => {} },
    email: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: { ...DEFAULT_AUTH_CONFIG, env: { ACCESS_TOKEN_SECRET: ACCESS, REFRESH_TOKEN_SECRET: REFRESH } },
  });
  return svc;
}

describe('login refresh token contract', () => {
  it('returns a raw refresh token the SPA can store', async () => {
    const auth = memoryAuth();
    await auth.register({
      campusId: CAMPUS,
      email: 's@t.test',
      password: 'Password1!',
      name: 'Stu',
      role: 'STUDENT',
    });
    const out = await auth.login({ campusId: CAMPUS, email: 's@t.test', password: 'Password1!' });
    expect(out.tokens.accessToken).toBeTypeOf('string');
    expect(out.refreshToken).toMatch(/^[a-f0-9]{96}$/);
  });

  it('refresh returns tokens.accessToken plus a rotated refreshToken', async () => {
    const auth = memoryAuth();
    await auth.register({
      campusId: CAMPUS,
      email: 's2@t.test',
      password: 'Password1!',
      name: 'Stu',
      role: 'STUDENT',
    });
    const login = await auth.login({ campusId: CAMPUS, email: 's2@t.test', password: 'Password1!' });
    const rotated = await auth.refresh(login.refreshToken);
    expect(rotated.tokens.accessToken).toBeTypeOf('string');
    expect(rotated.refreshToken).toMatch(/^[a-f0-9]{96}$/);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
  });

  it('rejects an unknown refresh token', async () => {
    const auth = memoryAuth();
    await expect(auth.refresh('f'.repeat(96))).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' });
  });

  it('rejects a reused refresh token after rotation', async () => {
    const auth = memoryAuth();
    await auth.register({
      campusId: CAMPUS,
      email: 's3@t.test',
      password: 'Password1!',
      name: 'Stu',
      role: 'STUDENT',
    });
    const login = await auth.login({ campusId: CAMPUS, email: 's3@t.test', password: 'Password1!' });
    await auth.refresh(login.refreshToken);
    await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});

describe('loginV1 stores the refresh token from login JSON', () => {
  afterEach(() => {
    v1Token.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the refresh token returned beside tokens.accessToken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            tokens: { accessToken: 'access-1', expiresIn: 900 },
            refreshToken: 'a'.repeat(96),
            user: {
              userId: 'u1',
              campusId: CAMPUS,
              role: 'STUDENT',
              name: 'Stu',
              email: 's@t.test',
              status: 'ACTIVE',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const res = await loginV1(CAMPUS, 's@t.test', 'Password1!');
    expect(res.ok).toBe(true);
    expect(v1Token.getRefresh()).toBe('a'.repeat(96));
  });
});
