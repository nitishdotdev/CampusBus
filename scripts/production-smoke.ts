import { z } from 'zod';

const directory = z.array(z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i),
  name: z.string().trim().min(2),
  shortCode: z.string().trim().min(2).max(16),
  city: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  zoom: z.number().int().min(1).max(20),
  timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }),
})).nonempty().refine(rows => new Set(rows.map(row => row.id)).size === rows.length &&
  new Set(rows.map(row => row.shortCode.toUpperCase())).size === rows.length, 'Expected unique campus IDs and short codes');

async function main() {
  const api = new URL(process.env.SMOKE_API_ORIGIN ?? 'https://campusmove-nahp.onrender.com');
  const frontend = new URL(process.env.SMOKE_FRONTEND_ORIGIN ?? 'https://campus-bus-delta.vercel.app').origin;
  const expected = process.env.SMOKE_EXPECTED_CAMPUS ?? 'RKGIT';
  const response = await fetch(new URL('/api/v1/campuses', api), {
    headers: { Origin: frontend, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(45_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Campus directory returned HTTP ${response.status}.`);
  if (response.headers.get('access-control-allow-origin') !== frontend) {
    throw new Error('Campus directory did not allow the production frontend origin.');
  }
  const result = directory.safeParse(await response.json());
  if (!result.success) throw new Error('Campus directory returned invalid, duplicate, or empty campus records.');
  if (!result.data.some(row => row.shortCode === expected)) {
    throw new Error(`Campus directory is missing ${expected}.`);
  }
  console.log(`Campus directory returned HTTP 200 with ${result.data.length} valid campus record(s), including ${expected}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Campus smoke test failed.');
  process.exitCode = 1;
});
