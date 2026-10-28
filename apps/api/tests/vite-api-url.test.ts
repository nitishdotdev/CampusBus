import { describe, expect, it } from 'vitest';
import { assertViteV1ApiUrl } from '../../../vite.v1-env';

describe('production Vite v1 API URL', () => {
  it('fails clearly when VITE_USE_V1_API is true and the URL is missing', () => {
    expect(() => assertViteV1ApiUrl({ VITE_USE_V1_API: 'true' })).toThrow(/VITE_API_V1_URL/);
  });

  it('fails when the URL is not an absolute http(s) origin', () => {
    expect(() => assertViteV1ApiUrl({ VITE_USE_V1_API: 'true', VITE_API_V1_URL: '/api' })).toThrow(/absolute/);
    expect(() => assertViteV1ApiUrl({ VITE_USE_V1_API: 'true', VITE_API_V1_URL: 'ftp://x' })).toThrow(/http/);
  });

  it('accepts an absolute https Render URL', () => {
    expect(() => assertViteV1ApiUrl({
      VITE_USE_V1_API: 'true',
      VITE_API_V1_URL: 'https://campusmove-api.onrender.com',
    })).not.toThrow();
  });

  it('is a no-op when v1 is not enabled', () => {
    expect(() => assertViteV1ApiUrl({ VITE_USE_V1_API: 'false' })).not.toThrow();
    expect(() => assertViteV1ApiUrl({})).not.toThrow();
  });
});
