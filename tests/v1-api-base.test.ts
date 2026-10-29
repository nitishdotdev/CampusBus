import { describe, expect, it } from 'vitest';
import { assertProductionV1Env, resolveV1ApiBase } from '../src/services/v1/apiBase';

describe('resolveV1ApiBase', () => {
  it('returns a trimmed absolute URL without a trailing slash', () => {
    expect(resolveV1ApiBase({ VITE_API_V1_URL: ' https://api.example.edu/ ' })).toBe(
      'https://api.example.edu',
    );
  });

  it('throws in production v1 mode when the URL is missing or empty', () => {
    expect(() => resolveV1ApiBase({ VITE_USE_V1_API: 'true', PROD: true })).toThrow(
      /VITE_API_V1_URL/,
    );
    expect(() =>
      resolveV1ApiBase({ VITE_USE_V1_API: 'true', NODE_ENV: 'production', VITE_API_V1_URL: '' }),
    ).toThrow(/VITE_API_V1_URL/);
  });

  it('throws in production v1 mode when the URL is not an absolute http(s) origin', () => {
    expect(() =>
      resolveV1ApiBase({ VITE_USE_V1_API: 'true', PROD: true, VITE_API_V1_URL: '/api' }),
    ).toThrow(/VITE_API_V1_URL/);
    expect(() =>
      resolveV1ApiBase({
        VITE_USE_V1_API: 'true',
        MODE: 'production',
        VITE_API_V1_URL: 'not-a-url',
      }),
    ).toThrow(/VITE_API_V1_URL/);
  });

  it('returns empty when v1 is disabled and no URL is set', () => {
    expect(resolveV1ApiBase({})).toBe('');
    expect(resolveV1ApiBase({ VITE_USE_V1_API: 'false' })).toBe('');
  });
});

describe('assertProductionV1Env', () => {
  it('fails a production v1 build when VITE_API_V1_URL is not a valid absolute URL', () => {
    expect(() =>
      assertProductionV1Env({ VITE_USE_V1_API: 'true', NODE_ENV: 'production' }),
    ).toThrow(/VITE_API_V1_URL/);
  });

  it('allows production builds when v1 is off, and v1 builds when the URL is absolute', () => {
    expect(() => assertProductionV1Env({ NODE_ENV: 'production' })).not.toThrow();
    expect(() =>
      assertProductionV1Env({
        VITE_USE_V1_API: 'true',
        NODE_ENV: 'production',
        VITE_API_V1_URL: 'https://campusbus-api.example.com',
      }),
    ).not.toThrow();
  });
});
