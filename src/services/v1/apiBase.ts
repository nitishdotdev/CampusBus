export type V1Env = {
  VITE_API_V1_URL?: string;
  VITE_USE_V1_API?: string;
  PROD?: boolean;
  NODE_ENV?: string;
  MODE?: string;
};

const MISSING_URL =
  'VITE_API_V1_URL must be a valid absolute http(s) URL in production when VITE_USE_V1_API=true';

function isProduction(env: V1Env): boolean {
  return env.PROD === true || env.NODE_ENV === 'production' || env.MODE === 'production';
}

function isV1Enabled(env: V1Env): boolean {
  return env.VITE_USE_V1_API === 'true';
}

function parseAbsoluteHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function resolveV1ApiBase(env: V1Env = {}): string {
  const parsed = parseAbsoluteHttpUrl(env.VITE_API_V1_URL);
  if (parsed) return parsed;
  if (isV1Enabled(env) && isProduction(env)) {
    throw new Error(MISSING_URL);
  }
  return '';
}

export function assertProductionV1Env(env: V1Env = {}): void {
  resolveV1ApiBase(env);
}

export function readViteV1Env(metaEnv: Record<string, unknown> | undefined): V1Env {
  const env = metaEnv ?? {};
  return {
    VITE_API_V1_URL: typeof env.VITE_API_V1_URL === 'string' ? env.VITE_API_V1_URL : undefined,
    VITE_USE_V1_API: typeof env.VITE_USE_V1_API === 'string' ? env.VITE_USE_V1_API : undefined,
    PROD: env.PROD === true,
    MODE: typeof env.MODE === 'string' ? env.MODE : undefined,
    NODE_ENV: env.MODE === 'production' || env.PROD === true ? 'production' : undefined,
  };
}
