import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { AuthService, DEFAULT_AUTH_CONFIG } from '../src/auth/service';
import { hashPassword } from '../src/auth/passwords';
import { createApp } from '../src/http/app';
import type {
  EmailSender, EmailTokenRepository, RefreshTokenRepository, Role, UserDTO, UserRepository, UserStatus,
} from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const SECRET = 'a-very-long-secret-for-tests-0123456789abcdef';
const REFRESH = 'a-different-refresh-secret-0123456789abcdef';
const ENV = {
  ACCESS_TOKEN_SECRET: SECRET,
  REFRESH_TOKEN_SECRET: REFRESH,
} as NodeJS.ProcessEnv;

function oid(n: number): string {
  return n.toString(16).padStart(24, '0');
}

function memoryUsers(): UserRepository & { store: Map<string, UserDTO & { passwordHash: string }> } {
  const store = new Map<string, UserDTO & { passwordHash: string }>();
  return {
    store,
    async findById(campusId, id) {
      const u = store.get(id);
      return u && u.campusId === campusId ? u : null;
    },
    async findByEmail(campusId, email) {
      return [...store.values()].find((u) => u.campusId === campusId && u.email === email.toLowerCase()) ?? null;
    },
    async create(u) {
      const id = oid(store.size + 1);
      const dto: UserDTO & { passwordHash: string } = {
        id, campusId: u.campusId, email: u.email.toLowerCase(), name: u.name,
        role: u.role, status: u.status, emailVerifiedAt: null, passwordHash: u.passwordHash,
      };
      store.set(id, dto);
      return dto;
    },
    async updateStatus(campusId, id, status) {
      const u = store.get(id);
      if (!u || u.campusId !== campusId) return false;
      u.status = status;
      return true;
    },
    async verifyEmail() { return true; },
    async updatePassword(campusId, id, hash) {
      const u = store.get(id);
      if (!u || u.campusId !== campusId) return false;
      u.passwordHash = hash;
      return true;
    },
    async list(campusId, opts) {
      const items = [...store.values()].filter((u) => u.campusId === campusId && (!opts.role || u.role === opts.role));
      return { items, total: items.length, page: 1, pageSize: 25 };
    },
    async assignTransport() { return true; },
  };
}

function memoryRefresh(): RefreshTokenRepository & { rows: Array<any> } {
  const rows: Array<any> = [];
  return {
    rows,
    async create(t) {
      const id = oid(rows.length + 100);
      rows.push({ id, ...t, revokedAt: null, previousId: t.previousId ?? null });
      return id;
    },
    async find(tokenHash) {
      return rows.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async revoke(id, at) {
      const r = rows.find((x) => x.id === id);
      if (r) r.revokedAt = at;
    },
    async revokeFamily(familyId, at) {
      for (const r of rows) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = at;
    },
    async revokeAll(userId, at) {
      for (const r of rows) if (r.userId === userId && !r.revokedAt) r.revokedAt = at;
    },
    async purgeExpired() { return 0; },
  };
}

const emailTokens: EmailTokenRepository = {
  async upsert() {},
  async find() { return null; },
  async markUsed() {},
};
const email: EmailSender = { async sendVerification() {}, async sendPasswordReset() {} };

function makeAuth(users: UserRepository, refreshTokens: RefreshTokenRepository) {
  return new AuthService({
    users, refreshTokens, emailTokens, email,
    config: { ...DEFAULT_AUTH_CONFIG, env: ENV, rateLimitLoginAttempts: 100 },
  });
}

function makeApp(auth: AuthService, users: UserRepository) {
  return createApp({
    ingest: {} as any, trips: {} as any, live: {} as any,
    auth, users, buses: {} as any, routes: {} as any, tripRepo: {} as any,
    verifyToken: (t) => auth.verifyAccessToken(t),
    allowedOrigins: ['https://campus-move-one.vercel.app'],
  });
}

describe('v1 auth HTTP contract (SPA)', () => {
  let users: ReturnType<typeof memoryUsers>;
  let refresh: ReturnType<typeof memoryRefresh>;
  let app: express.Express;

  beforeEach(async () => {
    users = memoryUsers();
    refresh = memoryRefresh();
    const hash = await hashPassword('Password1!');
    await users.create({ campusId: CAMPUS, email: 'stu@t.test', passwordHash: hash, name: 'Stu', role: 'STUDENT' as Role, status: 'ACTIVE' as UserStatus });
    app = makeApp(makeAuth(users, refresh), users);
  });

  it('login returns tokens.accessToken, top-level refreshToken, and user', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({
      campusId: CAMPUS, email: 'stu@t.test', password: 'Password1!',
    });
    expect(r.status).toBe(200);
    expect(r.body.tokens.accessToken).toBeTypeOf('string');
    expect(r.body.tokens.expiresIn).toBe(900);
    expect(r.body.refreshToken).toBeTypeOf('string');
    expect(r.body.refreshToken.length).toBeGreaterThan(32);
    expect(r.body.user).toMatchObject({ email: 'stu@t.test', role: 'STUDENT', status: 'ACTIVE' });
  });

  it('refresh returns the SPA shape { tokens: { accessToken, expiresIn }, refreshToken }', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({
      campusId: CAMPUS, email: 'stu@t.test', password: 'Password1!',
    });
    const rt = login.body.refreshToken as string;
    const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(r.status).toBe(200);
    expect(r.body.tokens.accessToken).toBeTypeOf('string');
    expect(r.body.tokens.expiresIn).toBe(900);
    expect(r.body.refreshToken).toBeTypeOf('string');
    expect(r.body.refreshToken).not.toBe(rt);
    expect(r.body.accessToken).toBeUndefined();
  });

  it('rejects an invalid refresh token with 401', async () => {
    const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'deadbeef'.repeat(8) });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a reused (already rotated) refresh token and revokes the family', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({
      campusId: CAMPUS, email: 'stu@t.test', password: 'Password1!',
    });
    const rt = login.body.refreshToken as string;
    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(first.status).toBe(200);
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('REFRESH_TOKEN_REUSE');
    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(rotated.status).toBe(401);
  });

  it('rejects a missing refreshToken body with 400', async () => {
    const r = await request(app).post('/api/v1/auth/refresh').send({});
    expect(r.status).toBe(400);
  });

  it('rejects an expired refresh token with 401', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({
      campusId: CAMPUS, email: 'stu@t.test', password: 'Password1!',
    });
    const rt = login.body.refreshToken as string;
    for (const row of refresh.rows) row.expiresAt = new Date(Date.now() - 1000);
    const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('REFRESH_TOKEN_EXPIRED');
  });
});
