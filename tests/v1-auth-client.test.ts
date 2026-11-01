import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginV1, registerV1 } from '../src/services/v1/auth';
import { ApiV1Error } from '../src/services/v1/client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const campusId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('V1 signup and login client', () => {
  it('posts login to /api/v1/auth/login with campusId, email, and password', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        campusId,
        email: 'student@campus.edu',
        password: 'Password1!',
      });
      return jsonResponse({
        tokens: { accessToken: 'access', expiresIn: 900 },
        refreshToken: 'refresh',
        user: {
          userId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          campusId,
          role: 'STUDENT',
          name: 'Stu',
          email: 'student@campus.edu',
          status: 'ACTIVE',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await loginV1(campusId, 'student@campus.edu', 'Password1!');
    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/auth\/login$/);
    expect(String(fetchMock.mock.calls[0][1]?.method).toUpperCase()).toBe('POST');
  });

  it('posts student signup to /api/v1/auth/register with campusId, name, email, password, and STUDENT role', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        campusId,
        email: 'student@campus.edu',
        password: 'Password1!',
        name: 'Stu Dent',
        role: 'STUDENT',
      });
      return jsonResponse({
        user: {
          userId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          campusId,
          role: 'STUDENT',
          name: 'Stu Dent',
          email: 'student@campus.edu',
          status: 'ACTIVE',
        },
      }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await registerV1({
      campusId,
      email: 'student@campus.edu',
      password: 'Password1!',
      name: 'Stu Dent',
      role: 'STUDENT',
    });
    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/auth\/register$/);
  });

  it('does not treat a missing V1 route as a generic login failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const res = await loginV1(campusId, 'student@campus.edu', 'Password1!');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/not found|missing route|v1/i);
      expect(res.error).not.toMatch(/incorrect email or password/i);
    }
  });

  it('surfaces invalid credentials distinctly from connectivity failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'INVALID_CREDENTIALS' }, 401)),
    );
    const invalid = await loginV1(campusId, 'student@campus.edu', 'WrongPass1!');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/incorrect email or password/i);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const offline = await loginV1(campusId, 'student@campus.edu', 'Password1!');
    expect(offline.ok).toBe(false);
    if (!offline.ok) {
      expect(offline.error).toMatch(/connection|cors|reach/i);
      expect(offline.error).not.toMatch(/incorrect email or password/i);
    }
  });

  it('wraps HTTP 404 as ApiV1Error so callers can distinguish a missing route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const { v1Client } = await import('../src/services/v1/client');
    await expect(v1Client.postPublic('/api/v1/auth/login', {})).rejects.toBeInstanceOf(ApiV1Error);
    await expect(v1Client.postPublic('/api/v1/auth/login', {})).rejects.toMatchObject({ status: 404 });
  });
});
