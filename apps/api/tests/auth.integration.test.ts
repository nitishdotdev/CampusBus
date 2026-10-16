import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, MONGO_URI, type Harness } from './harness';

// Single harness for all auth tests — avoids 5× connection overhead on FerretDB
describe.skipIf(!MONGO_URI)('Auth integration (single harness)', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const api = () => request(h.app);
  const campus = () => h.seed.campusA;
  const reg = (email: string, role = 'STUDENT', overrides: object = {}) =>
    api().post('/api/v1/auth/register').send({ campusId: campus(), email, password: 'Password1!', name: 'T', role, ...overrides });
  const login = (email: string, pw = 'Password1!') =>
    api().post('/api/v1/auth/login').send({ campusId: campus(), email, password: pw });
  let globalTok = '';

  // ── Registration ──────────────────────────────────────────────────────────
  describe('registration', () => {
    it('student gets status ACTIVE', async () => {
      const r = await reg('s1@t.test'); expect(r.status).toBe(201);
      expect(r.body.user).toMatchObject({ role: 'STUDENT', status: 'ACTIVE', email: 's1@t.test' });
      expect(r.body.user.passwordHash).toBeUndefined();
    });
    it('driver gets status PENDING', async () => {
      const r = await reg('d1@t.test', 'DRIVER'); expect(r.status).toBe(201);
      expect(r.body.user.status).toBe('PENDING');
    });
    it('ADMIN role is not self-registerable', async () => {
      expect((await reg('a1@t.test', 'ADMIN')).status).toBe(400);
    });
    it('duplicate email in same campus → 409', async () => {
      await reg('dup@t.test');
      expect((await reg('dup@t.test')).status).toBe(409);
      expect((await reg('dup@t.test')).body.error).toBe('EMAIL_ALREADY_REGISTERED');
    });
    it('same email in different campus → 201', async () => {
      await reg('cross@t.test');
      const r = await api().post('/api/v1/auth/register').send({ campusId: h.seed.campusB, email: 'cross@t.test', password: 'Password1!', name: 'X', role: 'STUDENT' });
      expect(r.status).toBe(201);
    });
    it.each([['Short1!'], ['nouppercase1'], ['NoNumber!!'], ['a'.repeat(73) + '1!']])('rejects weak password: %s', async ([pw]) => {
      const r = await api().post('/api/v1/auth/register').send({ campusId: campus(), email: `weak_${pw!.length}@t.test`, password: pw, name: 'X', role: 'STUDENT' });
      expect(r.status).toBe(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('correct credentials return access token and session info', async () => {
      await reg('login1@t.test');
      const r = await login('login1@t.test');
      expect(r.status).toBe(200);
      expect(r.body.tokens.accessToken).toBeTypeOf('string');
      expect(r.body.tokens.expiresIn).toBe(900);
      expect(r.body.user).toMatchObject({ role: 'STUDENT', email: 'login1@t.test' });
      globalTok = r.body.tokens.accessToken;
    });
    it('wrong password → 401', async () => {
      await reg('login2@t.test');
      expect((await login('login2@t.test', 'WrongPass1!')).status).toBe(401);
    });
    it('unknown email → 401 with same error as wrong password (no enumeration)', async () => {
      await reg('enum@t.test');
      const bad = await login('enum@t.test', 'WrongPass1!');
      const unknown = await login('nobody@t.test', 'WrongPass1!');
      expect(bad.status).toBe(401); expect(unknown.status).toBe(401);
      expect(bad.body.error).toBe(unknown.body.error);
    });
    it('PENDING driver → 403', async () => {
      await reg('pend@t.test', 'DRIVER');
      expect((await login('pend@t.test')).status).toBe(403);
    });
    it('DISABLED account → 403', async () => {
      await reg('dis@t.test');
      await h.models.User.updateOne({ email: 'dis@t.test', campusId: campus() }, { status: 'DISABLED' });
      expect((await login('dis@t.test')).status).toBe(403);
    });
    it('missing required field → 400 not 401', async () => {
      expect((await api().post('/api/v1/auth/login').send({ campusId: campus(), email: 'x@t.test' })).status).toBe(400);
    });
    it('login persists a hashed refresh token in the DB', async () => {
      await reg('rt@t.test');
      await login('rt@t.test');
      const dbToken: any = await (h.models as any).RefreshToken.findOne({ revokedAt: null }).lean();
      expect(dbToken).not.toBeNull();
      expect(dbToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ── Me endpoint ───────────────────────────────────────────────────────────
  describe('GET /api/v1/users/me', () => {
    it('returns the authenticated user; 401 without token', async () => {
      await reg('me1@t.test');
      const lr = await login('me1@t.test');
      const r = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${lr.body.tokens.accessToken}`);
      expect(r.status).toBe(200);
      expect(r.body.email).toBe('me1@t.test');
      expect((await api().get('/api/v1/users/me')).status).toBe(401);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  describe('logout-all', () => {
    it('revokes all live refresh tokens for the user', async () => {
      await reg('la@t.test');
      const lr = await login('la@t.test');
      await api().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${lr.body.tokens.accessToken}`).send({});
      const alive: any[] = await (h.models as any).RefreshToken.find({ userId: lr.body.user.userId, revokedAt: null }).lean();
      expect(alive).toHaveLength(0);
    });
  });

  // ── Refresh token rotation ────────────────────────────────────────────────
  describe('refresh token rotation (service level)', () => {
    it('create → revoke → find shows revokedAt', async () => {
      const { repos } = h.services;
      const crypto = await import('crypto');
      const raw = crypto.randomBytes(48).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      const id = await repos.refreshTokens.create({ userId: h.seed.driver1, campusId: campus(), tokenHash: hash, familyId: 'fam_rot', expiresAt: new Date(Date.now() + 86400_000) });
      const found = await repos.refreshTokens.find(hash);
      expect(found?.revokedAt).toBeNull();
      await repos.refreshTokens.revoke(id, new Date());
      expect((await repos.refreshTokens.find(hash))?.revokedAt).not.toBeNull();
    });
    it('revokeFamily revokes all tokens in the family', async () => {
      const { repos } = h.services;
      const crypto = await import('crypto');
      const mkHash = () => crypto.randomBytes(48).toString('hex');
      const hashes = [mkHash(), mkHash(), mkHash()];
      await Promise.all(hashes.map(raw => repos.refreshTokens.create({ userId: h.seed.driver1, campusId: campus(), tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), familyId: 'fam_theft', expiresAt: new Date(Date.now() + 86400_000) })));
      await repos.refreshTokens.revokeFamily('fam_theft', new Date());
      const alive: any[] = await (h.models as any).RefreshToken.find({ familyId: 'fam_theft', revokedAt: null }).lean();
      expect(alive).toHaveLength(0);
    });
    it('purge removes only expired tokens', async () => {
      const { repos } = h.services;
      const crypto = await import('crypto');
      const mk = (family: string, ms: number) => {
        const raw = crypto.randomBytes(48).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
        return repos.refreshTokens.create({ userId: h.seed.driver1, campusId: campus(), tokenHash, familyId: family, expiresAt: new Date(Date.now() + ms) });
      };
      const liveHash = crypto.createHash('sha256').update(crypto.randomBytes(48).toString('hex')).digest('hex');
      await mk('purg_exp', -1000); // expired
      await repos.refreshTokens.create({ userId: h.seed.driver1, campusId: campus(), tokenHash: liveHash, familyId: 'purg_live', expiresAt: new Date(Date.now() + 86400_000) });
      await repos.refreshTokens.purgeExpired(new Date());
      expect(await repos.refreshTokens.find(liveHash)).not.toBeNull();
    });
  });

  // ── Password hashing ──────────────────────────────────────────────────────
  describe('password hashing', () => {
    it('new accounts get Argon2id hashes', async () => {
      await reg('argon@t.test');
      const u: any = await h.models.User.findOne({ email: 'argon@t.test' }).select('+passwordHash').lean();
      expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    });
    it('bcrypt hash is silently migrated to Argon2id on successful login', async () => {
      const bcrypt = await import('bcryptjs');
      const bcryptHash = await bcrypt.hash('Password1!', 6);
      await h.models.User.create({ campusId: campus(), email: 'bcrypt@t.test', passwordHash: bcryptHash, name: 'B', role: 'STUDENT', status: 'ACTIVE' });
      expect((await login('bcrypt@t.test')).status).toBe(200);
      const after: any = await h.models.User.findOne({ email: 'bcrypt@t.test' }).select('+passwordHash').lean();
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
    });
    it('unknown hash format always rejected', async () => {
      await h.models.User.create({ campusId: campus(), email: 'badalg@t.test', passwordHash: 'plain:pw', name: 'X', role: 'STUDENT', status: 'ACTIVE' });
      expect((await login('badalg@t.test')).status).toBe(401);
    });
  });

  // ── Admin bootstrap ───────────────────────────────────────────────────────
  describe('admin bootstrap', () => {
    it('creates first admin; second call refused', async () => {
      const mongoose = await import('mongoose');
      const freshCampus = new mongoose.Types.ObjectId().toString();
      const first = await h.services.auth.bootstrapAdmin(freshCampus, 'admin@t.test', 'Password1!', 'Admin');
      expect(first).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
      await expect(h.services.auth.bootstrapAdmin(freshCampus, 'other@t.test', 'Password1!', 'X')).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
    });
    it('ADMIN cannot register via public endpoint', async () => {
      expect((await reg('badadmin@t.test', 'ADMIN')).status).toBe(400);
    });
  });

  // ── Email verification ────────────────────────────────────────────────────
  describe('email verification and password reset', () => {
    it('correct OTP marks emailVerifiedAt; reuse is rejected', async () => {
      await reg('verify@t.test');
      const u: any = await h.models.User.findOne({ email: 'verify@t.test' }).lean();
      const crypto = await import('crypto');
      const otp = '112233';
      await h.services.repos.emailTokens.upsert({ userId: String(u._id), campusId: campus(), purpose: 'VERIFY_EMAIL', tokenHash: crypto.createHash('sha256').update(otp).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) });
      const tok = h.token({ id: String(u._id), campusId: campus(), role: 'STUDENT' });
      expect((await api().post('/api/v1/auth/verify-email').set('Authorization', `Bearer ${tok}`).send({ otp: '999999' })).status).toBe(400);
      expect((await api().post('/api/v1/auth/verify-email').set('Authorization', `Bearer ${tok}`).send({ otp })).status).toBe(204);
      expect((await api().post('/api/v1/auth/verify-email').set('Authorization', `Bearer ${tok}`).send({ otp })).status).toBe(400); // reuse
      const after: any = await h.models.User.findOne({ email: 'verify@t.test' }).lean();
      expect(after.emailVerifiedAt).not.toBeNull();
    });
    it('password reset: valid OTP changes hash, old password fails, all refresh tokens revoked', async () => {
      await reg('reset@t.test');
      const lr = await login('reset@t.test');
      const userId = lr.body.user.userId;
      const crypto = await import('crypto');
      const otp = '445566';
      await h.services.repos.emailTokens.upsert({ userId, campusId: campus(), purpose: 'RESET_PASSWORD', tokenHash: crypto.createHash('sha256').update(otp).digest('hex'), expiresAt: new Date(Date.now() + 1_200_000) });
      expect((await api().post('/api/v1/auth/confirm-password-reset').send({ campusId: campus(), email: 'reset@t.test', otp, newPassword: 'weak' })).status).toBe(400);
      expect((await api().post('/api/v1/auth/confirm-password-reset').send({ campusId: campus(), email: 'reset@t.test', otp, newPassword: 'NewPass2!' })).status).toBe(204);
      expect((await login('reset@t.test')).status).toBe(401);
      expect((await login('reset@t.test', 'NewPass2!')).status).toBe(200);
      expect((await api().post('/api/v1/auth/confirm-password-reset').send({ campusId: campus(), email: 'reset@t.test', otp, newPassword: 'AnotherPass3!' })).status).toBe(400); // reuse
      const alive: any[] = await (h.models as any).RefreshToken.find({ userId, revokedAt: null }).lean();
      expect(alive).toHaveLength(0);
    });
    it('request-password-reset always returns 204 even for unknown email', async () => {
      expect((await api().post('/api/v1/auth/request-password-reset').send({ campusId: campus(), email: 'nobody@t.test' })).status).toBe(204);
    });
  });
});
