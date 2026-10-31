import { describe, expect, it } from 'vitest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../src/auth/service';
import { hashPassword } from '../src/auth/passwords';
import { hashToken } from '../src/auth/tokens';
import type {
  EmailTokenRepository, RefreshTokenRepository, UserDTO, UserRepository,
} from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const USER_ID = 'b'.repeat(24);
const ACCESS_SECRET = 'test-access-secret-test-access-secret-12345678';
const REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-1234567';
const OTP = '445566';

type StoredUser = UserDTO & { passwordHash: string };
type RefreshRec = {
  id: string; userId: string; campusId: string; familyId: string;
  expiresAt: Date; revokedAt: Date | null; previousId: string | null;
};
type EmailRec = {
  userId: string; campusId: string; purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
  tokenHash: string; expiresAt: Date; usedAt: Date | null;
};

async function makeResetAuth(opts?: { revokeAll?: RefreshTokenRepository['revokeAll'] }) {
  const stored: StoredUser = {
    id: USER_ID,
    campusId: CAMPUS,
    email: 'reset@t.test',
    name: 'Reset User',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordHash: await hashPassword('Password1!'),
  };

  const refreshStore = new Map<string, RefreshRec>();
  let seq = 0;
  const emailStore: EmailRec[] = [];

  const users: UserRepository = {
    findById: async (campusId, id) => (campusId === stored.campusId && id === stored.id ? stored : null),
    findByEmail: async (campusId, email) =>
      (campusId === stored.campusId && email === stored.email ? stored : null),
    create: async () => stored,
    updateStatus: async () => true,
    verifyEmail: async () => true,
    updatePassword: async (_c, _id, hash) => {
      stored.passwordHash = hash;
      return true;
    },
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
    revokeAll: opts?.revokeAll ?? (async (userId, at) => {
      for (const rec of refreshStore.values()) if (rec.userId === userId && !rec.revokedAt) rec.revokedAt = at;
    }),
    purgeExpired: async () => 0,
  };

  const emailTokens: EmailTokenRepository = {
    upsert: async (t) => {
      const i = emailStore.findIndex((r) => r.userId === t.userId && r.purpose === t.purpose);
      const rec: EmailRec = { ...t, usedAt: null };
      if (i >= 0) emailStore[i] = rec; else emailStore.push(rec);
    },
    find: async (tokenHash, purpose) =>
      emailStore.find((r) => r.tokenHash === tokenHash && r.purpose === purpose) ?? null,
    markUsed: async (tokenHash, at) => {
      const rec = emailStore.find((r) => r.tokenHash === tokenHash);
      if (rec) rec.usedAt = at;
    },
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

  return { auth, stored, refreshStore, emailStore, emailTokens };
}

describe('password reset session revocation', () => {
  it('revokes every prior refresh token, rejects the old password, accepts the new one, and refuses old refresh tokens', async () => {
    const { auth, refreshStore, emailTokens } = await makeResetAuth();
    const first = await auth.login({ campusId: CAMPUS, email: 'reset@t.test', password: 'Password1!' });
    const second = await auth.login({ campusId: CAMPUS, email: 'reset@t.test', password: 'Password1!' });
    expect([...refreshStore.values()].filter((r) => r.revokedAt === null)).toHaveLength(2);

    await emailTokens.upsert({
      userId: USER_ID, campusId: CAMPUS, purpose: 'RESET_PASSWORD',
      tokenHash: hashToken(OTP), expiresAt: new Date(Date.now() + 1_200_000),
    });

    await auth.confirmPasswordReset(CAMPUS, 'reset@t.test', OTP, 'NewPass2!');

    const alive = [...refreshStore.values()].filter((r) => r.revokedAt === null);
    expect(alive).toHaveLength(0);

    await expect(auth.login({ campusId: CAMPUS, email: 'reset@t.test', password: 'Password1!' }))
      .rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    const after = await auth.login({ campusId: CAMPUS, email: 'reset@t.test', password: 'NewPass2!' });
    expect(after.refreshToken).toEqual(expect.stringMatching(/^[a-f0-9]{96}$/));

    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({ status: 401 });
    await expect(auth.refresh(second.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('does not report success or consume the OTP when session revocation fails', async () => {
    const { auth, stored, emailStore, emailTokens } = await makeResetAuth({
      revokeAll: async () => { throw new Error('revoke failed'); },
    });
    await auth.login({ campusId: CAMPUS, email: 'reset@t.test', password: 'Password1!' });
    const originalHash = stored.passwordHash;
    await emailTokens.upsert({
      userId: USER_ID, campusId: CAMPUS, purpose: 'RESET_PASSWORD',
      tokenHash: hashToken(OTP), expiresAt: new Date(Date.now() + 1_200_000),
    });

    await expect(auth.confirmPasswordReset(CAMPUS, 'reset@t.test', OTP, 'NewPass2!'))
      .rejects.toBeInstanceOf(Error);

    expect(stored.passwordHash).toBe(originalHash);
    expect(emailStore[0]?.usedAt).toBeNull();
  });
});
