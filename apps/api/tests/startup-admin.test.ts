import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { bootstrapAdminOnStartup } from '../src/bootstrap/startupAdmin';
import { DomainError } from '../src/domain/errors';
import { createHarness, PG_TEST_URL } from './harness';

const campus = {
  id: 'a'.repeat(24), name: 'Example Campus', shortCode: 'TEST', city: 'Example',
  lat: 1, lng: 2, zoom: 15, timezone: 'UTC',
};
const env = {
  BOOTSTRAP_ADMIN_ENABLED: 'true', CAMPUS_SHORT_CODE: 'test',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test', BOOTSTRAP_ADMIN_NAME: 'Example Admin',
  BOOTSTRAP_ADMIN_PASSWORD: 'ExamplePassword1!',
};
function deps() {
  const findByCode = vi.fn(async (_code: string) => campus);
  const bootstrapAdmin = vi.fn(async (_id: string, email: string, _password: string, name: string) => ({
    userId: 'b'.repeat(24), campusId: campus.id, role: 'ADMIN' as const,
    status: 'ACTIVE' as const, email, name,
  }));
  return { campuses: { findByCode }, auth: { bootstrapAdmin } };
}

describe('startup administrator provisioning', () => {
  it('is disabled by default and ignores unused credentials', async () => {
    const { campuses, auth } = deps();
    expect(await bootstrapAdminOnStartup({}, campuses, auth)).toBe('disabled');
    expect(await bootstrapAdminOnStartup({ ...env, BOOTSTRAP_ADMIN_ENABLED: 'false' }, campuses, auth)).toBe('disabled');
    expect(campuses.findByCode).not.toHaveBeenCalled();
    expect(auth.bootstrapAdmin).not.toHaveBeenCalled();
  });

  it('provisions only the selected existing campus using the auth service', async () => {
    const { campuses, auth } = deps();
    expect(await bootstrapAdminOnStartup(env, campuses, auth)).toBe('created');
    expect(campuses.findByCode).toHaveBeenCalledWith('TEST');
    expect(auth.bootstrapAdmin).toHaveBeenCalledWith(campus.id, env.BOOTSTRAP_ADMIN_EMAIL,
      env.BOOTSTRAP_ADMIN_PASSWORD, env.BOOTSTRAP_ADMIN_NAME);
  });

  it('skips an existing admin without resetting credentials', async () => {
    const { campuses, auth } = deps();
    auth.bootstrapAdmin.mockRejectedValue(new DomainError(409, 'ADMIN_ALREADY_EXISTS'));
    expect(await bootstrapAdminOnStartup(env, campuses, auth)).toBe('already-exists');
  });

  it.each([
    { BOOTSTRAP_ADMIN_ENABLED: 'yes' },
    { BOOTSTRAP_ADMIN_EMAIL: '' },
    { BOOTSTRAP_ADMIN_PASSWORD: 'weak' },
    { BOOTSTRAP_ADMIN_NAME: '' },
    { CAMPUS_SHORT_CODE: '' },
    { BOOTSTRAP_SECRET: 'test-only-secret' },
  ])('rejects invalid or conflicting settings', async overrides => {
    const { campuses, auth } = deps();
    await expect(bootstrapAdminOnStartup({ ...env, ...overrides }, campuses, auth)).rejects.toThrow();
    expect(auth.bootstrapAdmin).not.toHaveBeenCalled();
  });

  it('does not create a missing campus', async () => {
    const { auth } = deps();
    await expect(bootstrapAdminOnStartup(env, { findByCode: async () => null }, auth))
      .rejects.toThrow('campus does not exist');
    expect(auth.bootstrapAdmin).not.toHaveBeenCalled();
  });

  it('does not expose raw failures', async () => {
    const { campuses, auth } = deps();
    auth.bootstrapAdmin.mockRejectedValue(new Error('private failure detail'));
    await expect(bootstrapAdminOnStartup(env, campuses, auth))
      .rejects.toThrow('Admin startup bootstrap failed; verify configuration and database');
  });
});

describe.skipIf(!PG_TEST_URL)('startup admin PostgreSQL integration', () => {
  it('serializes concurrent first-admin attempts and preserves the winner on restart', async () => {
    const h = await createHarness();
    try {
      const { campuses, users } = h.services.repos;
      const { id: _id, ...input } = campus;
      const target = await campuses.create(input);
      const attempts = await Promise.all([
        bootstrapAdminOnStartup(env, campuses, h.services.auth),
        bootstrapAdminOnStartup({ ...env, BOOTSTRAP_ADMIN_EMAIL: 'other@example.test' }, campuses, h.services.auth),
      ]);
      expect(attempts.sort()).toEqual(['already-exists', 'created']);
      const admins = await users.list(target.id, { role: 'ADMIN' });
      expect(admins.total).toBe(1);
      const winner = admins.items[0]!;
      expect(winner.status).toBe('ACTIVE');
      expect(await bootstrapAdminOnStartup({ ...env, BOOTSTRAP_ADMIN_PASSWORD: 'DifferentPassword1!' },
        campuses, h.services.auth)).toBe('already-exists');
      const stored = await users.findByEmail(target.id, winner.email);
      expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
      const login = await request(h.app).post('/api/v1/auth/login').send({
        campusId: target.id, email: winner.email, password: env.BOOTSTRAP_ADMIN_PASSWORD,
      });
      expect(login.status).toBe(200);
      expect(login.body.user).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', campusId: target.id });
      const denied = await request(h.app).post('/api/v1/auth/login').send({
        campusId: target.id, email: winner.email, password: 'DifferentPassword1!',
      });
      expect(denied.status).toBe(401);
    } finally {
      await h.close();
    }
  });
});
