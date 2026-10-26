import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const renderYaml = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const deploymentDoc = readFileSync(new URL('../docs/DEPLOYMENT.md', import.meta.url), 'utf8');

describe('render.yaml', () => {
  it('defines a single campusbus-api starter service with PostgreSQL commands', () => {
    expect(renderYaml).toMatch(/name:\s*campusbus-api/);
    expect(renderYaml).not.toMatch(/campusmove-api/);
    expect(renderYaml.match(/^\s*-\s*type:\s*web\s*$/gm) ?? []).toHaveLength(1);
    expect(renderYaml).toMatch(/plan:\s*starter/);
    expect(renderYaml).toMatch(/npm ci && npm run build && npm run db:migrate/);
    expect(renderYaml).toMatch(/npm run start/);
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/api\/health/);
    expect(renderYaml).not.toMatch(/api:build/);
    expect(renderYaml).not.toMatch(/api:start/);
  });

  it('does not hardcode a stale frontend origin or secret values', () => {
    expect(renderYaml).not.toMatch(/campus-move-one\.vercel\.app/);
    expect(renderYaml).not.toMatch(/campusmove-api\.onrender\.com/);
    expect(renderYaml).toMatch(/key:\s*CORS_ORIGIN/);
    expect(renderYaml).toMatch(/key:\s*DATABASE_URL/);
    expect(renderYaml).toMatch(/key:\s*JWT_SECRET/);
    expect(renderYaml).not.toMatch(/key:\s*MONGODB_URI/);
    expect(renderYaml).not.toMatch(/mongodb\+srv:\/\//);
  });
});

describe('vercel.json', () => {
  it('does not force the frontend onto the MongoDB v1 API', () => {
    expect(vercelJson.env?.VITE_USE_V1_API).not.toBe('true');
    expect(vercelJson.env?.VITE_API_V1_URL).toBeUndefined();
    expect(JSON.stringify(vercelJson)).not.toMatch(/onrender\.com/);
  });
});

describe('docs/DEPLOYMENT.md', () => {
  it('describes CampusBus on nitishdotdev/CampusBus with PostgreSQL then Render then Vercel', () => {
    expect(deploymentDoc).toMatch(/CampusBus/);
    expect(deploymentDoc).toMatch(/nitishdotdev\/CampusBus/);
    expect(deploymentDoc).toMatch(/\bmain\b/);
    expect(deploymentDoc).toMatch(/PostgreSQL/);
    expect(deploymentDoc).toMatch(/DATABASE_URL/);
    expect(deploymentDoc).toMatch(/JWT_SECRET/);
    expect(deploymentDoc).toMatch(/BOOTSTRAP_SECRET/);
    expect(deploymentDoc).not.toMatch(/MongoDB Atlas/);
  });

  it('does not keep CampusMove URLs, branches, or fabricated hosts', () => {
    expect(deploymentDoc).not.toMatch(/CampusMove/);
    expect(deploymentDoc).not.toMatch(/campus-move-one\.vercel\.app/);
    expect(deploymentDoc).not.toMatch(/campusmove-api\.onrender\.com/);
    expect(deploymentDoc).not.toMatch(/feature\/frontend-v1-integration/);
    expect(deploymentDoc).not.toMatch(/Apex State University/);
  });
});
