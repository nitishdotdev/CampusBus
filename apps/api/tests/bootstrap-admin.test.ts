import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthService, DEFAULT_AUTH_CONFIG, bootstrapAdminSchema } from '../src/auth/service';
import { createApp } from '../src/http/app';
import { DomainError } from '../src/domain/errors';
import type { CampusRepository, Principal, UserDTO, UserRepository } from '../src/domain/types';

const CAMPUS = 'a'.repeat(24);
const MISSING_CAMPUS = 'c'.repeat(24);
const SECRET = 'test-access-secret-test-access-secret-12345678';
const REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-1234567';
const BOOTSTRAP_SECRET = 'one-time-bootstrap-secret-value';

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

function makeUsers(existingAdminCount = 0): { users: UserRepository; created: UserDTO[] } {
  const created: UserDTO[] = [];
  const users: UserRepository = {
    findById: async () => null,
    findByEmail: async () => null,
    create: async (u) => {
      const dto: UserDTO = {
        id: '2'.repeat(24),
        campusId: u.campusId,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        emailVerifiedAt: null,
      };
      created.push(dto);
      return dto;
    },
    updateStatus: async () => true,
    verifyEmail: async () => true,
    updatePassword: async () => true,
    list: async () => ({ items: [], total: existingAdminCount, page: 1, pageSize: 1 }),
    assignTransport: async () => true,
  };
  return { users, created };
}

function makeCampuses(ids: string[] = [CAMPUS]): CampusRepository {
  return {
    list: async () => ids.map((id) => ({
      id, name: 'Campus', shortCode: 'CAMP', city: 'X', lat: 1, lng: 2, zoom: 15, timezone: 'UTC',
    })),
    findById: async (id) => (ids.includes(id)
      ? { id, name: 'Campus', shortCode: 'CAMP', city: 'X', lat: 1, lng: 2, zoom: 15, timezone: 'UTC' }
      : null),
    findByCode: async () => null,
    create: async () => ({ id: CAMPUS, name: 'Campus', shortCode: 'CAMP', city: 'X', lat: 1, lng: 2, zoom: 15, timezone: 'UTC' }),
  };
}

function makeAuth(opts: { existingAdminCount?: number; campuses?: CampusRepository } = {}) {
  const { users, created } = makeUsers(opts.existingAdminCount ?? 0);
  const auth = new AuthService({
    users,
    campuses: opts.campuses ?? makeCampuses(),
    refreshTokens: { create: async () => 'x', find: async () => null, revoke: async () => {}, revokeFamily: async () => {}, revokeAll: async () => {}, purgeExpired: async () => 0 },
    emailTokens: { upsert: async () => {}, find: async () => null, markUsed: async () => {} },
    email: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: {
      ...DEFAULT_AUTH_CONFIG,
      env: { ACCESS_TOKEN_SECRET: SECRET, REFRESH_TOKEN_SECRET: REFRESH_SECRET } as NodeJS.ProcessEnv,
    },
  });
  return { auth, created };
}

describe('bootstrapAdminSchema', () => {
  it('requires campusId, email, strong password, and name', () => {
    expect(bootstrapAdminSchema.safeParse({}).success).toBe(false);
    expect(bootstrapAdminSchema.safeParse({
      campusId: CAMPUS, email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin',
    }).success).toBe(true);
    expect(bootstrapAdminSchema.safeParse({
      campusId: 'not-an-id', email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin',
    }).success).toBe(false);
    expect(bootstrapAdminSchema.safeParse({
      campusId: CAMPUS, email: 'not-email', password: 'Password1!', name: 'Campus Admin',
    }).success).toBe(false);
    expect(bootstrapAdminSchema.safeParse({
      campusId: CAMPUS, email: 'admin@campus.edu', password: 'short', name: 'Campus Admin',
    }).success).toBe(false);
  });
});

describe('AuthService.bootstrapAdmin', () => {
  it('creates the first ACTIVE ADMIN after verifying the campus exists', async () => {
    const { auth, created } = makeAuth();
    const user = await auth.bootstrapAdmin(CAMPUS, 'admin@campus.edu', 'Password1!', 'Campus Admin');
    expect(user).toMatchObject({
      role: 'ADMIN', status: 'ACTIVE', campusId: CAMPUS, email: 'admin@campus.edu', name: 'Campus Admin',
    });
    expect(created).toHaveLength(1);
  });

  it('refuses bootstrap when an administrator already exists', async () => {
    const { auth } = makeAuth({ existingAdminCount: 1 });
    await expect(auth.bootstrapAdmin(CAMPUS, 'admin@campus.edu', 'Password1!', 'Campus Admin'))
      .rejects.toMatchObject({ status: 409, code: 'ADMIN_ALREADY_EXISTS' });
  });

  it('refuses bootstrap when the campus does not exist', async () => {
    const { auth } = makeAuth({ campuses: makeCampuses([CAMPUS]) });
    await expect(auth.bootstrapAdmin(MISSING_CAMPUS, 'admin@campus.edu', 'Password1!', 'Campus Admin'))
      .rejects.toMatchObject({ status: 400, code: 'CAMPUS_NOT_FOUND' });
  });

  it('validates email and password before creating an admin', async () => {
    const { auth } = makeAuth();
    await expect(auth.bootstrapAdmin(CAMPUS, 'not-email', 'Password1!', 'Campus Admin'))
      .rejects.toBeInstanceOf(DomainError);
    await expect(auth.bootstrapAdmin(CAMPUS, 'admin@campus.edu', 'weak', 'Campus Admin'))
      .rejects.toBeInstanceOf(DomainError);
  });
});

describe('POST /api/v1/auth/bootstrap-admin', () => {
  it('requires BOOTSTRAP_SECRET and refuses after an administrator exists', async () => {
    const { auth } = makeAuth();
    const app = createApp({
      ...unusedDeps(),
      auth,
      users: makeUsers().users,
      verifyToken: () => null,
      allowedOrigins: [],
      bootstrapSecret: BOOTSTRAP_SECRET,
    });

    const denied = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      campusId: CAMPUS, email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin',
    });
    expect(denied.status).toBe(403);

    const wrong = await request(app)
      .post('/api/v1/auth/bootstrap-admin')
      .set('x-bootstrap-secret', 'nope')
      .send({ campusId: CAMPUS, email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin' });
    expect(wrong.status).toBe(403);

    const first = await request(app)
      .post('/api/v1/auth/bootstrap-admin')
      .set('x-bootstrap-secret', BOOTSTRAP_SECRET)
      .send({ campusId: CAMPUS, email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin' });
    expect(first.status).toBe(201);
    expect(first.body.user).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('is disabled when BOOTSTRAP_SECRET is empty', async () => {
    const { auth } = makeAuth();
    const app = createApp({
      ...unusedDeps(),
      auth,
      users: makeUsers().users,
      verifyToken: () => null,
      allowedOrigins: [],
      bootstrapSecret: '',
    });
    const res = await request(app)
      .post('/api/v1/auth/bootstrap-admin')
      .set('x-bootstrap-secret', '')
      .send({ campusId: CAMPUS, email: 'admin@campus.edu', password: 'Password1!', name: 'Campus Admin' });
    expect(res.status).toBe(403);
  });
});

describe('public registration vs driver provisioning', () => {
  it('public register accepts STUDENT and rejects ADMIN', async () => {
    const { auth } = makeAuth();
    const student = await auth.register({
      campusId: CAMPUS, email: 's@campus.edu', password: 'Password1!', name: 'Stu', role: 'STUDENT',
    });
    expect(student.user).toMatchObject({ role: 'STUDENT', status: 'ACTIVE' });
    await expect(auth.register({
      campusId: CAMPUS, email: 'a@campus.edu', password: 'Password1!', name: 'Ad', role: 'ADMIN',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects public DRIVER registration; admin-created drivers are ACTIVE', async () => {
    const { auth } = makeAuth();
    await expect(auth.register({
      campusId: CAMPUS, email: 'd@campus.edu', password: 'Password1!', name: 'Dee', role: 'DRIVER',
    })).rejects.toMatchObject({ status: 400 });

    const driver = await auth.createDriver(
      { userId: '4'.repeat(24), campusId: CAMPUS, role: 'ADMIN' } as Principal,
      { email: 'd2@campus.edu', password: 'Password1!', name: 'Dee Two' },
    );
    expect(driver).toMatchObject({ role: 'DRIVER', status: 'ACTIVE' });
  });
});
