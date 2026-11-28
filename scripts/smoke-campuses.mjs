#!/usr/bin/env node
/**
 * Post-deployment smoke test for the CampusBus API.
 *
 * Verifies, against a live deployment:
 *   - GET /healthz returns 200 {"status":"ok"} (liveness)
 *   - GET /readyz returns 200 {"status":"ready"} (at least one campus is provisioned)
 *   - GET /api/v1/campuses returns 200 JSON, a non-empty array of valid campus records
 *   - the optional --expect-short-code campus is present
 *   - CORS allows the frontend origin with credentials
 *
 * Usage:
 *   node scripts/smoke-campuses.mjs --api https://campusmove-nahp.onrender.com \
 *     --origin https://campus-bus-delta.vercel.app --expect-short-code RKGIT
 *
 * Prints no response secrets. Exits non-zero on the first failed check group.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
  args.set(key.slice(2), process.argv[i + 1]);
}

const apiBase = (args.get('api') ?? process.env.SMOKE_API_BASE ?? '').replace(/\/$/, '');
const origin = args.get('origin') ?? process.env.SMOKE_ORIGIN ?? 'https://campus-bus-delta.vercel.app';
const expectShortCode = (args.get('expect-short-code') ?? process.env.SMOKE_EXPECT_SHORT_CODE ?? '').toUpperCase();

if (!/^https:\/\//.test(apiBase)) {
  console.error('FAIL: --api must be an absolute https URL (or set SMOKE_API_BASE).');
  process.exit(2);
}

const failures = [];
const pass = (msg) => console.log(`PASS  ${msg}`);
const fail = (msg) => { failures.push(msg); console.log(`FAIL  ${msg}`); };

async function get(path, headers = {}) {
  const res = await fetch(`${apiBase}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* keep raw text for diagnostics */ }
  return { status: res.status, headers: res.headers, body };
}

// 1. Liveness
try {
  const r = await get('/healthz');
  if (r.status === 200 && r.body?.status === 'ok') pass('GET /healthz -> 200 ok');
  else fail(`GET /healthz -> ${r.status} ${JSON.stringify(r.body)}`);
} catch (err) { fail(`GET /healthz unreachable: ${err.message}`); }

// 2. Operational readiness (campus provisioned)
try {
  const r = await get('/readyz');
  if (r.status === 200 && r.body?.status === 'ready') pass('GET /readyz -> 200 ready (campus provisioned)');
  else fail(`GET /readyz -> ${r.status} ${JSON.stringify(r.body)}`);
} catch (err) { fail(`GET /readyz unreachable: ${err.message}`); }

// 3. Public campus list, with CORS from the frontend origin
let campuses = [];
function validTimezone(value) {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}

try {
  const r = await get('/api/v1/campuses', { Origin: origin });
  const contentType = r.headers.get('content-type') ?? '';
  if (r.status !== 200) fail(`GET /api/v1/campuses -> ${r.status}`);
  else if (!contentType.includes('application/json')) fail(`GET /api/v1/campuses content-type is "${contentType}"`);
  else if (!Array.isArray(r.body)) fail('GET /api/v1/campuses body is not a JSON array');
  else if (r.body.length === 0) fail('GET /api/v1/campuses returned an empty campus list');
  else {
    campuses = r.body;
    const shapeOk = campuses.every((c) =>
      typeof c?.id === 'string' && /^[a-f0-9]{24}$/i.test(c.id) &&
      typeof c.name === 'string' && c.name.trim().length >= 2 &&
      typeof c.shortCode === 'string' && c.shortCode.trim().length >= 2 && c.shortCode.length <= 16 &&
      typeof c.city === 'string' &&
      typeof c.lat === 'number' && Math.abs(c.lat) <= 90 &&
      typeof c.lng === 'number' && Math.abs(c.lng) <= 180 &&
      Number.isInteger(c.zoom) && c.zoom >= 1 && c.zoom <= 20 && validTimezone(c.timezone)) &&
      new Set(campuses.map(c => c.id)).size === campuses.length &&
      new Set(campuses.map(c => c.shortCode.toUpperCase())).size === campuses.length;
    if (shapeOk) pass(`GET /api/v1/campuses -> 200, ${campuses.length} campus record(s) with valid shape`);
    else fail('GET /api/v1/campuses records do not match the V1Campus schema');
  }

  const allowOrigin = r.headers.get('access-control-allow-origin');
  const allowCredentials = r.headers.get('access-control-allow-credentials');
  if (allowOrigin === origin && allowCredentials === 'true') pass(`CORS allows ${origin} with credentials`);
  else fail(`CORS for ${origin}: allow-origin="${allowOrigin}" allow-credentials="${allowCredentials}"`);
} catch (err) { fail(`GET /api/v1/campuses unreachable: ${err.message}`); }

// 4. Expected campus present
if (expectShortCode) {
  if (campuses.some((c) => c?.shortCode === expectShortCode)) pass(`campus ${expectShortCode} is listed`);
  else fail(`campus ${expectShortCode} is NOT listed`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} smoke check(s) failed.`);
  process.exit(1);
}
console.log('\nAll campus smoke checks passed.');
