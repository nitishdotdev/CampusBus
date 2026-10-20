/**
 * API v1 client.
 * - Access token held in memory (never localStorage).
 * - Refresh token held in memory (ideal: HttpOnly cookie from server; until backend
 *   sets cookies, stored here in memory so it clears on tab close).
 * - On 401, attempts one silent refresh before propagating the error.
 */

const getApiBase = (): string => {
  const v = (import.meta as any).env?.VITE_API_V1_URL;
  return typeof v === 'string' && v ? v.replace(/\/$/, '') : '';
};

export class ApiV1Error extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiV1Error';
  }
}

// ── Token store (in-memory only) ─────────────────────────────────────────────
let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _refreshPromise: Promise<boolean> | null = null;

export const v1Token = {
  setAccess: (t: string | null) => { _accessToken = t; },
  setRefresh: (t: string | null) => { _refreshToken = t; },
  getAccess: () => _accessToken,
  getRefresh: () => _refreshToken,
  clear: () => { _accessToken = null; _refreshToken = null; },
};

// ── Low-level fetch ────────────────────────────────────────────────────────────
async function rawRequest<T>(
  path: string,
  options: RequestInit,
  withAuth = true,
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (withAuth && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  if (res.status === 204) return {} as T;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const code = typeof body === 'object' ? body?.error : undefined;
    throw new ApiV1Error(code ?? `HTTP ${res.status}`, res.status, code);
  }
  return body as T;
}

// ── Silent refresh ─────────────────────────────────────────────────────────────
async function doRefresh(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const data = await rawRequest<{ tokens: { accessToken: string; expiresIn: number }; refreshToken?: string }>(
      '/api/v1/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken: _refreshToken }) },
      false,
    );
    _accessToken = data.tokens.accessToken;
    if (data.refreshToken) _refreshToken = data.refreshToken;
    return true;
  } catch {
    v1Token.clear();
    return false;
  }
}

// ── Public request with auto-refresh ─────────────────────────────────────────
async function request<T>(path: string, options: RequestInit, withAuth = true): Promise<T> {
  try {
    return await rawRequest<T>(path, options, withAuth);
  } catch (err) {
    if (err instanceof ApiV1Error && err.status === 401 && withAuth) {
      // Deduplicate concurrent refresh attempts
      _refreshPromise ??= doRefresh().finally(() => { _refreshPromise = null; });
      const ok = await _refreshPromise;
      if (ok) return rawRequest<T>(path, options, withAuth);
    }
    throw err;
  }
}

export const v1Client = {
  get:    <T>(path: string) => request<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch:  <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postPublic: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, false),
};
