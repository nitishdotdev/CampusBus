import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Regression coverage for QA findings F1 (logout), F8 (timeouts) and F12 (unknown URLs). */

const storage = new Map<string, string>();
const fakeSessionStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
};

let client: typeof import('../src/services/v1/client');
let auth: typeof import('../src/services/v1/auth');
const PENDING = 'campusbus_pending_logout';

beforeAll(async () => {
  vi.stubGlobal('window', { sessionStorage: fakeSessionStorage });
  client = await import('../src/services/v1/client');
  auth = await import('../src/services/v1/auth');
});

beforeEach(() => { storage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.stubGlobal('window', { sessionStorage: fakeSessionStorage }); });

/** A fetch that never answers unless its request is aborted, like a stalled connection. */
const stalledFetch = (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
});

describe('request timeout and network errors (F8)', () => {
  it('fails a stalled request with REQUEST_TIMEOUT after the timeout window', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(stalledFetch));
    const pending = client.v1Client.get('/api/v1/campuses');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 0 });
    await vi.advanceTimersByTimeAsync(client.REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('reports a dropped connection as NETWORK_ERROR, not as a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(client.v1Client.get('/api/v1/campuses')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('gives the user a readable sentence for a timed-out login', () => {
    const err = new client.ApiV1Error('REQUEST_TIMEOUT', 0, 'REQUEST_TIMEOUT');
    expect(auth.formatCampusFetchError(err)).toMatch(/Check your connection/);
  });
});

describe('logout is not silently lost (F1)', () => {
  it('keeps the refresh token for a later retry when the server cannot be reached', async () => {
    client.v1Token.setRefresh('refresh-A');
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);

    await auth.logoutV1();

    expect(client.v1Token.getRefresh()).toBeNull();          // local session still cleared at once
    expect(storage.get(PENDING)).toBe('refresh-A');          // but the server still owes a revocation
    expect(fetchMock).toHaveBeenCalledTimes(2);              // one retry inside the same logout
  });

  it('sends the logout with keepalive so it can complete while the page closes', async () => {
    client.v1Token.setRefresh('refresh-B');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await auth.logoutV1();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken: 'refresh-B' });
    expect(storage.has(PENDING)).toBe(false);
  });

  it('retries a pending logout on the next start and clears it once the server confirms', async () => {
    storage.set(PENDING, 'refresh-C');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await auth.flushPendingLogoutV1();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.has(PENDING)).toBe(false);
  });

  it('leaves the pending logout in place when the retry also fails', async () => {
    storage.set(PENDING, 'refresh-D');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('still offline'); }));

    await auth.flushPendingLogoutV1();

    expect(storage.get(PENDING)).toBe('refresh-D');
  });
});

describe('unknown addresses show a page instead of redirecting (F12)', () => {
  it('renders a "Page not found" message with recovery links', async () => {
    const { NotFoundPage } = await import('../src/pages/NotFoundPage');
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/student/does-not-exist'] }, createElement(NotFoundPage)));
    expect(html).toContain('Page not found');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/"');
  });
});
