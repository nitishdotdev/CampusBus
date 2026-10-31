import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const apiServer = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8');
const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const renderYaml = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('production v1 wiring', () => {
  it('apps/api uses resolveAllowedOrigins instead of a localhost CORS default', () => {
    expect(apiServer).toMatch(/resolveAllowedOrigins/);
    expect(apiServer).not.toMatch(/CORS_ORIGIN \?\? 'http:\/\/localhost:5173'/);
  });

  it('keeps production on campusmove-api + Mongo and Vercel v1 flag without baking an API URL', () => {
    expect(renderYaml).toMatch(/name:\s*campusmove-api/);
    expect(renderYaml).toMatch(/key:\s*MONGODB_URI/);
    expect(renderYaml).toMatch(/npm run api:build/);
    expect(vercelJson.env?.VITE_USE_V1_API).toBe('true');
    expect(vercelJson.env?.VITE_API_V1_URL).toBeUndefined();
  });

  it('production Vite builds assert VITE_API_V1_URL via the shared apiBase helper', () => {
    expect(viteConfig).toMatch(/assertProductionV1Env/);
    expect(viteConfig).toMatch(/campusbus-v1-env/);
  });
});
