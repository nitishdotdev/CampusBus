/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const profile = { id: 'student', campusId: 'campus', role: 'STUDENT', name: 'Student', email: 'student@example.org', status: 'ACTIVE' };
const tokens = { tokens: { accessToken: 'access', expiresIn: 900 }, refreshToken: 'rotated' };

describe('Session restoration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_V1_URL', 'https://api.example.org');
    sessionStorage.setItem('campusbus_refresh', 'initial');
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('preserves the session through a failed network request and retries on demand', async () => {
    const request = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal('fetch', request);
    const { authService } = await import('../src/services/authService');

    const first = authService.restore();
    expect(authService.restore()).toBe(first);
    expect(await first).toBe('retry');
    expect(sessionStorage.getItem('campusbus_refresh')).toBe('initial');
    expect(await authService.restore()).toBe('restored');
    expect(sessionStorage.getItem('campusbus_refresh')).toBe('rotated');
    expect(authService.getCurrentUser()?.id).toBe('student');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('retries the profile with the fresh access token after a transient failure', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(tokens))
      .mockResolvedValueOnce(Response.json({ error: 'UNAVAILABLE' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal('fetch', request);
    const { authService } = await import('../src/services/authService');

    expect(await authService.restore()).toBe('retry');
    expect(await authService.restore()).toBe('restored');
    expect(request.mock.calls.map(([url]) => new URL(String(url), 'https://api.example.org').pathname)).toEqual([
      '/api/v1/auth/refresh', '/api/v1/users/me', '/api/v1/users/me',
    ]);
  });

  it('clears rejected refresh credentials and requires sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'INVALID_REFRESH_TOKEN' }, { status: 401 })));
    const { authService } = await import('../src/services/authService');

    expect(await authService.restore()).toBe('signed-out');
    expect(sessionStorage.getItem('campusbus_refresh')).toBeNull();
    expect(authService.getCurrentUser()).toBeNull();
  });
});
