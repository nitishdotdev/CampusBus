import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCampusFetchError, listCampuses } from '../src/services/v1/auth';
import { ApiV1Error } from '../src/services/v1/client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleCampus = {
  id: 'c1',
  name: 'North Campus',
  shortCode: 'NC',
  city: 'Testville',
  lat: 1,
  lng: 2,
  zoom: 15,
  timezone: 'UTC',
};

describe('listCampuses', () => {
  it('returns campuses from the v1 API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([sampleCampus]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(listCampuses()).resolves.toEqual([sampleCampus]);
  });

  it('does not hide HTTP failures as an empty campus list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })),
    );
    await expect(listCampuses()).rejects.toBeInstanceOf(ApiV1Error);
    await expect(listCampuses()).rejects.toMatchObject({ status: 404 });
  });

  it('does not hide network failures as an empty campus list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(listCampuses()).rejects.toThrow(/Failed to fetch/);
  });
});

describe('formatCampusFetchError', () => {
  it('distinguishes a missing route from connectivity/CORS and never calls either an empty campus list', () => {
    const missing = formatCampusFetchError(new ApiV1Error('HTTP 404', 404));
    const network = formatCampusFetchError(new TypeError('Failed to fetch'));
    expect(missing).toMatch(/not found|missing route/i);
    expect(network).toMatch(/connection|cors|reach/i);
    expect(missing).not.toEqual(network);
    expect(missing).not.toMatch(/no campuses found/i);
    expect(network).not.toMatch(/no campuses found/i);
  });
});
