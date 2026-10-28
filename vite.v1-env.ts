/**
 * Production Vite build guard for the v1 API base URL.
 * When VITE_USE_V1_API=true the frontend must target an absolute http(s) Render URL,
 * never a relative path or the Vercel origin.
 */
export function assertViteV1ApiUrl(env: Record<string, string | undefined> = process.env): void {
  if (env.VITE_USE_V1_API !== 'true') return;
  const raw = (env.VITE_API_V1_URL ?? '').trim();
  if (!raw) {
    throw new Error('FATAL: VITE_API_V1_URL is required when VITE_USE_V1_API=true. Set it to the absolute Render API URL (e.g. https://campusmove-api.onrender.com).');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`FATAL: VITE_API_V1_URL must be an absolute http(s) URL, got: ${raw}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`FATAL: VITE_API_V1_URL must use http or https, got: ${parsed.protocol}`);
  }
}
