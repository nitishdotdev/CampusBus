/**
 * API v1 client.
 * - Access token held in memory (never localStorage).
 * - Refresh token is scoped to this tab to support reloads on split-origin deployments.
 * - On 401, attempts one silent refresh before propagating the error.
 */

import { readViteV1Env, resolveV1ApiBase } from './apiBase';

const getApiBase = (): string => resolveV1ApiBase(readViteV1Env((import.meta as any).env));

export class ApiV1Error extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiV1Error';
  }
}

// ── Token store (in-memory only) ─────────────────────────────────────────────
let _accessToken: string | null = null;
const refreshStorageKey = 'campusbus_refresh';
let _refreshToken: string | null = typeof window === 'undefined' ? null : window.sessionStorage.getItem(refreshStorageKey);
function storeRefresh(token: string | null) {
  _refreshToken = token;
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(refreshStorageKey, token);
  else window.sessionStorage.removeItem(refreshStorageKey);
}
let _refreshPromise: Promise<boolean> | null = null;

export const v1Token = {
  setAccess: (t: string | null) => { _accessToken = t; },
  setRefresh: storeRefresh,
  getAccess: () => _accessToken,
  getRefresh: () => _refreshToken,
  clear: () => { _accessToken = null; storeRefresh(null); },
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
  const refreshToken = _refreshToken;
  if (!refreshToken) return false;
  try {
    const data = await rawRequest<{ tokens: { accessToken: string; expiresIn: number }; refreshToken?: string }>(
      '/api/v1/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
      false,
    );
    if (refreshToken !== _refreshToken) return false;
    _accessToken = data.tokens.accessToken;
    if (data.refreshToken) storeRefresh(data.refreshToken);
    return true;
  } catch (error) {
    if (refreshToken === _refreshToken && error instanceof ApiV1Error && [401, 403].includes(error.status)) {
      v1Token.clear();
    }
    return false;
  }
}

export function refreshV1Session(): Promise<boolean> {
  _refreshPromise ??= doRefresh().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// ── Public request with auto-refresh ─────────────────────────────────────────
async function request<T>(path: string, options: RequestInit, withAuth = true): Promise<T> {
  const sentToken = _accessToken;
  try {
    return await rawRequest<T>(path, options, withAuth);
  } catch (err) {
    if (err instanceof ApiV1Error && err.status === 401 && withAuth) {
      // Deduplicate concurrent refresh attempts
      const ok = (_accessToken && _accessToken !== sentToken) || await refreshV1Session();
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
