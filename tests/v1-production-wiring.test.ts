import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const apiServer = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../apps/api/src/compose.ts', import.meta.url), 'utf8');
const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const renderYaml = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const schemaPath = new URL('../apps/api/src/infra/postgres/schema.sql', import.meta.url);
const pgSchema = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';

describe('production v1 wiring', () => {
  it('apps/api uses resolveAllowedOrigins instead of a localhost CORS default', () => {
    expect(apiServer).toMatch(/resolveAllowedOrigins/);
    expect(apiServer).not.toMatch(/CORS_ORIGIN \?\? 'http:\/\/localhost:5173'/);
  });

  it('keeps production on campusmove-api + Neon Postgres and Vercel v1 flag without baking an API URL', () => {
    expect(renderYaml).toMatch(/name:\s*campusmove-api/);
    expect(renderYaml).toMatch(/key:\s*DATABASE_URL/);
    expect(renderYaml).not.toMatch(/key:\s*MONGODB_URI/);
    expect(renderYaml).toMatch(/npm run api:build/);
    expect(renderYaml).toMatch(/npm run api:start/);
    expect(vercelJson.env?.VITE_USE_V1_API).toBe('true');
    expect(vercelJson.env?.VITE_API_V1_URL).toBeUndefined();
  });

  it('production Vite builds assert VITE_API_V1_URL via the shared apiBase helper', () => {
    expect(viteConfig).toMatch(/assertProductionV1Env/);
    expect(viteConfig).toMatch(/campusbus-v1-env/);
  });

  it('does not point production auth at legacy /api/auth routes', () => {
    const loginPage = readFileSync(new URL('../src/pages/auth/LoginPage.tsx', import.meta.url), 'utf8');
    expect(loginPage).not.toMatch(/handleLegacy/);
    expect(loginPage).toMatch(/loginV1/);
    expect(loginPage).toMatch(/registerV1/);
    expect(loginPage).toMatch(/listCampuses/);
  });

  it('v1 API requires DATABASE_URL, uses Postgres TLS policy, and does not fatal on MONGODB_URI', () => {
    expect(apiServer).toMatch(/DATABASE_URL/);
    expect(apiServer).toMatch(/FATAL: DATABASE_URL is required/);
    expect(apiServer).not.toMatch(/FATAL: MONGODB_URI is required/);
    expect(apiServer).not.toMatch(/from 'mongoose'/);
    expect(apiServer).toMatch(/buildPgConnection/);
    expect(apiServer).toMatch(/createPostgresRepositories|infra\/postgres/);
  });

  it('v1 API listens on process.env.PORT bound to 0.0.0.0', () => {
    expect(apiServer).toMatch(/Number\(process\.env\.PORT/);
    expect(apiServer).toMatch(/listen\(\s*PORT\s*,\s*['"]0\.0\.0\.0['"]/);
  });

  it('compose wires domain services from repositories, not mongoose models', () => {
    expect(compose).not.toMatch(/from '\.\/infra\/mongo\/models'/);
    expect(compose).not.toMatch(/createRepositories\(models\)/);
    expect(compose).toMatch(/createServices\(/);
  });

  it('ships a v1 Postgres schema covering campuses, auth tokens, telemetry, and trips', () => {
    expect(pgSchema, 'apps/api/src/infra/postgres/schema.sql must exist').toBeTruthy();
    expect(pgSchema).toMatch(/CREATE SCHEMA IF NOT EXISTS v1/i);
    for (const table of [
      'campuses', 'users', 'refresh_tokens', 'email_tokens',
      'buses', 'routes', 'stops', 'trips', 'vehicle_locations',
      'telemetry', 'schedules', 'notifications', 'emergency_alerts',
    ]) {
      expect(pgSchema, `missing v1.${table}`).toMatch(new RegExp(`v1\\.${table}\\b`));
    }
  });
});
