import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../src/auth/tokens';
import { createHarness, PG_TEST_URL, type Harness } from './harness';

/** Regression coverage for QA findings F1, F2, F7, F10, F11 and F12 (API side). */
describe.skipIf(!PG_TEST_URL)('Sessions, error contract and request IDs (integration)', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h.close(); });

  const api = () => request(h.app);
  const campus = () => h.seed.campusA;
  let counter = 0;
  const signUp = async () => {
    const email = `session${++counter}-${Date.now()}@t.test`;
    const r = await api().post('/api/v1/auth/register').send({ campusId: campus(), email, password: 'Password1!', name: 'Session Tester', role: 'STUDENT' });
    expect(r.status).toBe(201);
    return email;
  };
  const signIn = async (email: string) => {
    const r = await api().post('/api/v1/auth/login').send({ campusId: campus(), email, password: 'Password1!' });
    expect(r.status).toBe(200);
    return { access: r.body.tokens.accessToken as string, refresh: r.body.refreshToken as string };
  };
  const me = (access: string) => api().get('/api/v1/users/me').set('Authorization', `Bearer ${access}`);

  describe('logout ends the session at once (F1, F2)', () => {
    it('stops the access token working immediately after logout, not at expiry', async () => {
      const email = await signUp();
      const { access, refresh } = await signIn(email);
      expect((await me(access)).status).toBe(200);
      expect((await api().post('/api/v1/auth/logout').send({ refreshToken: refresh })).status).toBe(204);
      const after = await me(access);
      expect(after.status).toBe(401);
      expect(after.body.error).toBe('SESSION_REVOKED');
    });

    it('reports a logged-out refresh token as revoked, not as reuse, and records why', async () => {
      const email = await signUp();
      const { refresh } = await signIn(email);
      await api().post('/api/v1/auth/logout').send({ refreshToken: refresh }).expect(204);
      const retry = await api().post('/api/v1/auth/refresh').send({ refreshToken: refresh });
      expect(retry.status).toBe(401);
      expect(retry.body.error).toBe('REFRESH_TOKEN_REVOKED');
      const row = await h.pool.query('SELECT revoked_reason FROM v1.refresh_tokens WHERE token_hash = $1', [hashRefreshToken(refresh)]);
      expect(row.rows[0]?.revoked_reason).toBe('LOGOUT');
    });

    it('logout-everywhere ends every session of the user, including other devices', async () => {
      const email = await signUp();
      const first = await signIn(email);
      const second = await signIn(email);
      await api().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${first.access}`).send({}).expect(204);
      expect((await me(first.access)).body.error).toBe('SESSION_REVOKED');
      expect((await me(second.access)).body.error).toBe('SESSION_REVOKED');
    });

    it('changing the password ends sessions that were signed in with the old password', async () => {
      const email = await signUp();
      const { access } = await signIn(email);
      await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${access}`)
        .send({ currentPassword: 'Password1!', newPassword: 'Changed-Password2' }).expect(204);
      expect((await me(access)).body.error).toBe('SESSION_REVOKED');
    });

    it('a rotated refresh keeps the same session alive', async () => {
      const email = await signUp();
      const { refresh } = await signIn(email);
      const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: refresh });
      expect(rotated.status).toBe(200);
      expect((await me(rotated.body.tokens.accessToken)).status).toBe(200);
    });

    it('a socket opened from a logged-out session is refused at the handshake', async () => {
      const email = await signUp();
      const { access, refresh } = await signIn(email);
      await api().post('/api/v1/auth/logout').send({ refreshToken: refresh }).expect(204);
      const socket = connect(h.url, { auth: { token: access }, transports: ['websocket'], reconnection: false, forceNew: true });
      const error = await new Promise<Error>((resolve, reject) => {
        socket.on('connect', () => reject(new Error('connected with a revoked session')));
        socket.on('connect_error', resolve);
      });
      socket.close();
      expect(error.message).toBe('SESSION_REVOKED');
    });
  });

  describe('error contract (F10, F11)', () => {
    it('answers a bad email with a plain sentence and the single INVALID_REQUEST code', async () => {
      const r = await api().post('/api/v1/auth/register').send({ campusId: campus(), email: 'not-an-email', password: 'Password1!', name: 'T', role: 'STUDENT' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('INVALID_REQUEST');
      expect(r.body.detail).toBe('Enter a valid email address.');
    });

    it('never returns raw validator wording', async () => {
      const r = await api().post('/api/v1/auth/register').send({ campusId: campus(), email: `long${Date.now()}@t.test`, password: 'Password1!', name: 'x'.repeat(5000), role: 'STUDENT' });
      expect(r.status).toBe(400);
      expect(r.body.detail).toBe('Enter a name up to 120 characters.');
      expect(r.text).not.toMatch(/expected|Too big|<=|issues|ZodError/i);
    });

    it('uses INVALID_REQUEST for a malformed password-reset body, matching the other auth routes', async () => {
      const r = await api().post('/api/v1/auth/confirm-password-reset').send({ campusId: campus(), email: 'a@t.test', otp: 'abc', newPassword: 'Password1!' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('INVALID_REQUEST');
      expect(r.body.detail).toBe('Enter the 6-digit code from the email.');
    });
  });

  describe('request identifiers and unknown routes (F7, F12 API side)', () => {
    it('echoes a well-formed incoming X-Request-Id', async () => {
      const r = await api().get('/healthz').set('X-Request-Id', 'qa-trace-000001');
      expect(r.headers['x-request-id']).toBe('qa-trace-000001');
    });

    it('generates an identifier when the incoming one is malformed', async () => {
      const r = await api().get('/healthz').set('X-Request-Id', 'bad value with spaces');
      expect(r.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('returns a JSON 404 for an unknown API route', async () => {
      const r = await api().get('/api/v1/does-not-exist');
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'NOT_FOUND' });
    });
  });
});
