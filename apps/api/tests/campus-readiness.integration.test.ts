import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { provisionCampus } from '../src/bootstrap/provisionCampus';
import { createHarness, PG_TEST_URL } from './harness';

describe.skipIf(!PG_TEST_URL)('Campus provisioning readiness', () => {
  it('keeps infrastructure health green when empty and becomes ready after idempotent provisioning', async () => {
    const harness = await createHarness({}, async (app, repos) => {
      const api = () => request(app);
      await api().get('/healthz').expect(200, { status: 'ok' });
      await api().get('/readyz').expect('Cache-Control', 'no-store')
        .expect(503, { status: 'unavailable', reason: 'NO_CAMPUSES' });
      await api().get('/api/v1/campuses').expect(200, []);

      const input = { name: 'Integration Campus', shortCode: 'INTEGRATION', city: 'Ghaziabad', lat: 28.7009, lng: 77.4426, zoom: 16, timezone: 'Asia/Kolkata' };
      const results = await Promise.all([
        provisionCampus(repos.campuses, input),
        provisionCampus(repos.campuses, { ...input, shortCode: 'integration' }),
      ]);
      expect(results.filter(result => result.created)).toHaveLength(1);
      expect(results[0].campus.id).toBe(results[1].campus.id);
      const rerun = await provisionCampus(repos.campuses, { ...input, name: 'Do not overwrite' });
      expect(rerun).toEqual({ created: false, campus: results[0].campus });
      await api().get('/readyz').expect(200, { status: 'ready' });
      await api().get('/healthz').expect(200, { status: 'ok' });
      await api().get('/api/v1/campuses').expect(200, [results[0].campus]);
    });
    await harness.close();
  });
});
