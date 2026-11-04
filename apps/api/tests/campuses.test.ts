import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import type { CampusDTO } from '../src/domain/types';

const sampleCampus: CampusDTO = {
  id: 'c'.repeat(24),
  name: 'North Campus',
  shortCode: 'NC',
  city: 'Testville',
  lat: 1,
  lng: 2,
  zoom: 15,
  timezone: 'UTC',
};

function unusedDeps() {
  return {
    ingest: { ingest: async () => ({}) },
    trips: { start: async () => ({}), end: async () => ({}) },
    live: { snapshot: async () => ({}) },
    buses: {},
    routes: {},
    tripRepo: {},
    auth: {},
    users: {},
  } as any;
}

describe('GET /api/v1/campuses on createApp', () => {
  it('is public and returns campuses matching listCampuses() / V1Campus', async () => {
    const app = createApp({
      ...unusedDeps(),
      campuses: { list: async () => [sampleCampus] },
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app).get('/api/v1/campuses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sampleCampus]);
    expect(res.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        shortCode: expect.any(String),
        city: expect.any(String),
        lat: expect.any(Number),
        lng: expect.any(Number),
        zoom: expect.any(Number),
        timezone: expect.any(String),
      }),
    );
  });

  it('returns an empty array only when no campuses exist', async () => {
    const app = createApp({
      ...unusedDeps(),
      campuses: { list: async () => [] },
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app).get('/api/v1/campuses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('does not require authentication', async () => {
    const app = createApp({
      ...unusedDeps(),
      campuses: { list: async () => [sampleCampus] },
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app).get('/api/v1/campuses');
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('POST /api/v1/campuses on createApp', () => {
  const body = {
    name: 'Public Campus',
    shortCode: 'PC',
    city: 'X',
    lat: 1,
    lng: 2,
    zoom: 15,
    timezone: 'UTC',
  };

  it('is not publicly unrestricted without a bootstrap secret', async () => {
    const created: unknown[] = [];
    const app = createApp({
      ...unusedDeps(),
      campuses: {
        list: async () => [],
        create: async (c: Omit<CampusDTO, 'id'>) => {
          created.push(c);
          return { id: 'd'.repeat(24), ...c };
        },
      },
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app).post('/api/v1/campuses').send(body);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
    expect(created).toHaveLength(0);
  });

  it('rejects a wrong bootstrap secret', async () => {
    const created: unknown[] = [];
    const app = createApp({
      ...unusedDeps(),
      campuses: {
        list: async () => [],
        create: async (c: Omit<CampusDTO, 'id'>) => {
          created.push(c);
          return { id: 'd'.repeat(24), ...c };
        },
      },
      bootstrapSecret: 'correct-secret',
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app)
      .post('/api/v1/campuses')
      .set('x-bootstrap-secret', 'wrong-secret')
      .send(body);
    expect(res.status).toBe(403);
    expect(created).toHaveLength(0);
  });

  it('creates a campus when the bootstrap secret matches', async () => {
    const app = createApp({
      ...unusedDeps(),
      campuses: {
        list: async () => [],
        create: async (c: Omit<CampusDTO, 'id'>) => ({ id: 'd'.repeat(24), ...c }),
      },
      bootstrapSecret: 'correct-secret',
      verifyToken: () => null,
      allowedOrigins: [],
    });
    const res = await request(app)
      .post('/api/v1/campuses')
      .set('x-bootstrap-secret', 'correct-secret')
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Public Campus',
      shortCode: 'PC',
      city: 'X',
      lat: 1,
      lng: 2,
    });
  });
});
