import type { CorsOptions } from 'cors';

const DEV_DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export type OriginCheck = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;

/** Parse and validate CORS_ORIGIN. Throws on unsafe production configuration. */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const isProduction = env.NODE_ENV === 'production';
  const raw = (env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);

  if (raw.includes('*')) {
    throw new Error('FATAL: Wildcard "*" is not a valid CORS_ORIGIN. List explicit origins (e.g. https://campusmove.vercel.app).');
  }

  const normalized = raw.map((o) => {
    let u: URL;
    try { u = new URL(o); } catch { throw new Error(`FATAL: CORS_ORIGIN contains an invalid origin: ${o}`); }
    if (u.pathname !== '/' || u.search || u.hash) {
      throw new Error(`FATAL: CORS_ORIGIN entries must be bare origins (scheme://host[:port]): ${o}`);
    }
    return u.origin;
  });

  if (isProduction) {
    for (const o of normalized) {
      const u = new URL(o);
      const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !isLocal) {
        throw new Error(`FATAL: CORS origin must use HTTPS in production: ${o}`);
      }
    }
    return normalized; // may be empty => only same-origin / non-browser clients
  }

  return normalized.length > 0 ? normalized : DEV_DEFAULT_ORIGINS;
}

/**
 * Origin callback shared by Express CORS and Socket.IO.
 * Requests without an Origin header (same-origin navigations, curl, server-to-server)
 * are not CORS requests and are allowed here; they are still subject to authentication.
 */
export function createOriginCheck(allowed: string[]): OriginCheck {
  const set = new Set(allowed);
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    return cb(null, set.has(origin));
  };
}

export function buildCorsOptions(allowed: string[]): CorsOptions {
  return {
    origin: createOriginCheck(allowed),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-bootstrap-secret'],
    maxAge: 600,
  };
}
