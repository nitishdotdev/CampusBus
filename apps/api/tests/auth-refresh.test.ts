import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../src/auth/service';
import { hashRefreshToken } from '../src/auth/tokens';
import { DomainError } from '../src/domain/errors';
import type {
  EmailSender, EmailTokenRepository, RefreshTokenRepository, Role, UserDTO, UserRepository, UserStatus,
} from '../src/domain/types';
import { createApp, type AppDeps } from '../src/http/app';

const CAMPUS = 'cccccccccccccccccccccccc';
const ACCESS = 'test-access-secret-test-access-secret-12345678';
const REFRESH = 'test-refresh-secret-test-refresh-secret-1234567';
const PASSWORD = 'Password1!';

function id() {
  return [...Array(24)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function memoryAuth() {
  const users = new Map<string, UserDTO & { passwordHash: string }>();
  const tokens: {
    id: string; userId: string; campusId: string; tokenHash: string; familyId: string;
    expiresAt: Date; revokedAt: Date | null; previousId: string | null;
  }[] = [];
  let clock = Date.now();

  const userRepo: UserRepository = {
    async findById(campusId, uid) {
      const u = [...users.values()].find((x) => x.id === uid && x.campusId === campusId);
      return u ? { ...u } : null;
    },
    async findByEmail(campusId, email) {
      const u = [...users.values()].find((x) => x.campusId === campusId && x.email === email.toLowerCase());
      return u ? { ...u } : null;
    },
    async create(u) {
      if ([...users.values()].some((x) => x.campusId === u.campusId && x.email === u.email)) {
        throw new DomainError(409, 'EMAIL_ALREADY_REGISTERED');
      }
      const rec: UserDTO & { passwordHash: string } = {
        id: id(), campusId: u.campusId, email: u.email, name: u.name, role: u.role, status: u.status,
        emailVerifiedAt: null, passwordHash: u.passwordHash,
      };
      users.set(rec.id, rec);
      return { ...rec };
    },
    async updateStatus() { return false; },
    async verifyEmail() { return false; },
    async updatePassword(campusId, uid, hash) {
      const u = users.get(uid);
      if (!u || u.campusId !== campusId) return false;
      u.passwordHash = hash;
      return true;
    },
    async list() { return { items: [], total: 0, page: 1, pageSize: 25 }; },
    async assignTransport() { return false; },
  };

  const refreshRepo: RefreshTokenRepository = {
    async create(t) {
      const rec = { id: id(), userId: t.userId, campusId: t.campusId, tokenHash: t.tokenHash, familyId: t.familyId, expiresAt: t.expiresAt, revokedAt: null, previousId: t.previousId ?? null };
      tokens.push(rec);
      return rec.id;
    },
    async find(tokenHash) { return tokens.find((t) => t.tokenHash === tokenHash) ?? null; },
    async revoke(rid, at) { const t = tokens.find((x) => x.id === rid); if (t) t.revokedAt = at; },
    async revokeFamily(familyId, at) { for (const t of tokens) if (t.familyId === familyId && !t.revokedAt) t.revokedAt = at; },
    async revokeAll(userId, at) { for (const t of tokens) if (t.userId === userId && !t.revokedAt) t.revokedAt = at; },
    async purgeExpired() { return 0; },
  };

  const emailTokens: EmailTokenRepository = {
    async upsert() {},
    async find() { return null; },
    async markUsed() {},
  };
  const email: EmailSender = { async sendVerification() {}, async sendPasswordReset() {} };

  const auth = new AuthService({
    users: userRepo, refreshTokens: refreshRepo, emailTokens, email,
    config: { ...DEFAULT_AUTH_CONFIG, env: { ACCESS_TOKEN_SECRET: ACCESS, REFRESH_TOKEN_SECRET: REFRESH } as NodeJS.ProcessEnv, rateLimitLoginAttempts: 100 },
    now: () => new Date(clock),
  });

  return {
    auth, tokens, users,
    advance(ms: number) { clock += ms; },
    async register(emailAddr: string, role: Role = 'STUDENT', status?: UserStatus) {
      const result = await auth.register({ campusId: CAMPUS, email: emailAddr, password: PASSWORD, name: 'T', role });
      if (status) {
        const u = [...users.values()].find((x) => x.email === emailAddr)!;
        u.status = status;
      }
      return result;
    },
  };
}

function stubApp(overrides: Partial<AppDeps> = {}) {
  const dummy = async () => { throw new Error('unused'); };
  return createApp({
    ingest: { ingest: dummy } as unknown as AppDeps['ingest'],
    trips: { start: dummy, end: dummy } as unknown as AppDeps['trips'],
    live: { snapshot: dummy } as unknown as AppDeps['live'],
    auth: (overrides.auth ?? { login: dummy, register: dummy, refresh: dummy, logout: dummy, logoutAll: dummy }) as unknown as AppDeps['auth'],
    users: { findById: async () => null, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), updateStatus: async () => false, assignTransport: async () => false } as unknown as AppDeps['users'],
    buses: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), findById: async () => null, create: dummy, update: async () => null, delete: async () => false, assignDriver: async () => null, assignRoute: async () => null } as unknown as AppDeps['buses'],
    routes: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }), findById: async () => null, create: dummy, update: async () => null, delete: async () => false } as unknown as AppDeps['routes'],
    tripRepo: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) } as unknown as AppDeps['tripRepo'],
    verifyToken: overrides.verifyToken ?? (() => null),
    allowedOrigins: overrides.allowedOrigins ?? [],
  });
}

describe('login / refresh token contract (SPA)', () => {
  it('successful login returns access and refresh tokens in the frontend shape', async () => {
    const h = memoryAuth();
    await h.register('login@t.test');
    const result = await h.auth.login({ campusId: CAMPUS, email: 'login@t.test', password: PASSWORD });
    expect(result.tokens.accessToken).toBeTypeOf('string');
    expect(result.tokens.expiresIn).toBe(900);
    expect(result.refreshToken).toMatch(/^[a-f0-9]{96}$/);
    expect(result.user).toMatchObject({ email: 'login@t.test', role: 'STUDENT', status: 'ACTIVE' });
    const stored = h.tokens.find((t) => t.tokenHash === hashRefreshToken(result.refreshToken));
    expect(stored).toBeDefined();
    expect(stored?.revokedAt).toBeNull();
  });

  it('valid refresh rotates and returns nested tokens plus a new refresh token', async () => {
    const h = memoryAuth();
    await h.register('ref@t.test');
    const login = await h.auth.login({ campusId: CAMPUS, email: 'ref@t.test', password: PASSWORD });
    const refreshed = await h.auth.refresh(login.refreshToken);
    expect(refreshed.tokens.accessToken).toBeTypeOf('string');
    expect(refreshed.tokens.expiresIn).toBe(900);
    expect(refreshed.refreshToken).toMatch(/^[a-f0-9]{96}$/);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(h.tokens.find((t) => t.tokenHash === hashRefreshToken(login.refreshToken))?.revokedAt).not.toBeNull();
  });

  it('rejects unknown, expired, and reused refresh tokens', async () => {
    const h = memoryAuth();
    await h.register('bad@t.test');
    const login = await h.auth.login({ campusId: CAMPUS, email: 'bad@t.test', password: PASSWORD });

    await expect(h.auth.refresh('0'.repeat(96))).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' });

    h.advance(31 * 86_400_000);
    await expect(h.auth.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401, code: 'REFRESH_TOKEN_EXPIRED' });

    const h2 = memoryAuth();
    await h2.register('reuse@t.test');
    const first = await h2.auth.login({ campusId: CAMPUS, email: 'reuse@t.test', password: PASSWORD });
    await h2.auth.refresh(first.refreshToken);
    await expect(h2.auth.refresh(first.refreshToken)).rejects.toMatchObject({ status: 401, code: 'REFRESH_TOKEN_REUSE' });
    expect(h2.tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('logout revokes the presented refresh token', async () => {
    const h = memoryAuth();
    await h.register('out@t.test');
    const login = await h.auth.login({ campusId: CAMPUS, email: 'out@t.test', password: PASSWORD });
    await h.auth.logout(login.refreshToken);
    await expect(h.auth.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401, code: 'REFRESH_TOKEN_REUSE' });
  });
});

describe('refresh HTTP contract', () => {
  it('rejects malformed refresh bodies without calling the service', async () => {
    const app = stubApp({
      auth: { refresh: async () => { throw new Error('refresh must not run'); } } as unknown as AppDeps['auth'],
    });
    const missing = await request(app).post('/api/v1/auth/refresh').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('MISSING_REFRESH_TOKEN');
    const wrongType = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 123 });
    expect(wrongType.status).toBe(400);
    const empty = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: '' });
    expect(empty.status).toBe(400);
  });

  it('login HTTP response includes refreshToken at the top level next to tokens', async () => {
    const h = memoryAuth();
    await h.register('http@t.test');
    const app = stubApp({ auth: h.auth });
    const res = await request(app).post('/api/v1/auth/login').send({ campusId: CAMPUS, email: 'http@t.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toMatch(/^[a-f0-9]{96}$/);
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.tokens.accessToken).toBeTypeOf('string');
    expect(refreshed.body.refreshToken).toMatch(/^[a-f0-9]{96}$/);
  });
});
