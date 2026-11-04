/** @vitest-environment jsdom */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LEGACY_RESOURCE =
  /\/api\/(?:routes|notifications|alerts|buses|trips|auth|admin|driver)(?:\/|$|\?)/;

function isLegacyUrl(url: string): boolean {
  if (url.includes('/api/v1/')) return false;
  return LEGACY_RESOURCE.test(url);
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('V1 initialization never hits leftover HTTP', () => {
  let urls: string[];

  beforeEach(() => {
    urls = [];
    vi.stubEnv('VITE_USE_V1_API', 'true');
    vi.stubEnv('VITE_API_V1_URL', 'https://campusmove-nahp.onrender.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(urlOf(input));
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('importing frontend singletons with VITE_USE_V1_API=true does not fetch leftover /api/*', async () => {
    await import('../src/services/routeService');
    await import('../src/services/notificationService');
    await import('../src/services/adminService');
    await import('../src/services/authService');
    await import('../src/services/tripService');
    await import('../src/services/realtimeService');
    await import('../src/services/socketService');
    await import('../src/services/locationService');
    await import('../src/store/AppContext');
    await new Promise((r) => setTimeout(r, 30));
    expect(urls.filter(isLegacyUrl)).toEqual([]);
  });

  it('mounts App with VITE_USE_V1_API=true and does not fetch leftover /api/*', async () => {
    const { default: App } = await import('../src/App');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);
    root.render(React.createElement(App));
    await new Promise((r) => setTimeout(r, 50));
    root.unmount();
    rootEl.remove();
    expect(urls.filter(isLegacyUrl)).toEqual([]);
  });

  it('changePassword in V1 does not call leftover /api/auth/change-password', async () => {
    const { authService } = await import('../src/services/authService');
    const result = await authService.changePassword('old-pass-1', 'NewPass2!');
    expect(urls.filter(isLegacyUrl)).toEqual([]);
    expect(result.success).toBe(false);
  });
});
