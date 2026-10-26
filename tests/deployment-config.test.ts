import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const renderYaml = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const deploymentDoc = readFileSync(new URL('../docs/DEPLOYMENT.md', import.meta.url), 'utf8');

describe('render.yaml', () => {
  it('defines a single campusbus-api starter service with Mongo API commands', () => {
    expect(renderYaml).toMatch(/name:\s*campusbus-api/);
    expect(renderYaml).not.toMatch(/campusmove-api/);
    expect(renderYaml.match(/^\s*-\s*type:\s*web\s*$/gm) ?? []).toHaveLength(1);
    expect(renderYaml).toMatch(/plan:\s*starter/);
    expect(renderYaml).toMatch(/npm ci && npm run api:build/);
    expect(renderYaml).toMatch(/npm run api:start/);
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/healthz/);
  });

  it('does not hardcode a stale frontend origin or secret values', () => {
    expect(renderYaml).not.toMatch(/campus-move-one\.vercel\.app/);
    expect(renderYaml).not.toMatch(/campusmove-api\.onrender\.com/);
    expect(renderYaml).toMatch(/key:\s*CORS_ORIGIN/);
    expect(renderYaml).toMatch(/key:\s*MONGODB_URI/);
    expect(renderYaml).not.toMatch(/mongodb\+srv:\/\//);
  });
});

describe('vercel.json', () => {
  it('enables v1 without baking in an unverified API URL', () => {
    expect(vercelJson.env?.VITE_USE_V1_API).toBe('true');
    expect(vercelJson.env?.VITE_API_V1_URL).toBeUndefined();
    expect(JSON.stringify(vercelJson)).not.toMatch(/onrender\.com/);
  });
});

describe('docs/DEPLOYMENT.md', () => {
  it('describes CampusBus on nitishdotdev/CampusBus main with Mongo then Render then Vercel', () => {
    expect(deploymentDoc).toMatch(/CampusBus/);
    expect(deploymentDoc).toMatch(/nitishdotdev\/CampusBus/);
    expect(deploymentDoc).toMatch(/\bmain\b/);
    expect(deploymentDoc).toMatch(/MongoDB Atlas/);
    expect(deploymentDoc).toMatch(/VITE_API_V1_URL/);
    expect(deploymentDoc).toMatch(/VITE_USE_V1_API/);
    expect(deploymentDoc).toMatch(/BOOTSTRAP_SECRET/);
  });

  it('does not keep CampusMove URLs, branches, or fabricated hosts', () => {
    expect(deploymentDoc).not.toMatch(/CampusMove/);
    expect(deploymentDoc).not.toMatch(/campus-move-one\.vercel\.app/);
    expect(deploymentDoc).not.toMatch(/campusmove-api\.onrender\.com/);
    expect(deploymentDoc).not.toMatch(/feature\/frontend-v1-integration/);
    expect(deploymentDoc).not.toMatch(/Apex State University/);
  });
});
