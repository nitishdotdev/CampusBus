import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { buildCorsOptions } from '../../../../server/config/cors';
import { DomainError } from '../domain/errors';
import type { LiveService } from '../domain/live';
import type { TelemetryIngestService } from '../domain/telemetry/ingest';
import type { TripService } from '../domain/trips';
import type { Principal } from '../domain/types';

export interface AppDeps {
  ingest: TelemetryIngestService; trips: TripService; live: LiveService;
  verifyToken: (token: string) => Principal | null; allowedOrigins: string[];
}
type AuthedRequest = Request & { principal: Principal };

const startSchema = z.object({ busId: z.string().regex(/^[a-f0-9]{24}$/i), simulated: z.boolean().optional() }).strict();

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(buildCorsOptions(deps.allowedOrigins)));
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); });

  const auth: RequestHandler = (req, res, next) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const principal = token ? deps.verifyToken(token) : null;
    if (!principal) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return; }
    (req as AuthedRequest).principal = principal;
    next();
  };
  const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
    (req, res, next) => { fn(req as AuthedRequest, res).catch(next); };

  app.post('/api/v1/telemetry', auth, wrap(async (req, res) => { res.json(await deps.ingest.ingest(req.principal, req.body)); }));

  app.post('/api/v1/trips/start', auth, wrap(async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) throw new DomainError(400, 'INVALID_REQUEST');
    const trip = await deps.trips.start(req.principal, parsed.data);
    res.status(201).json({ trip });
  }));

  app.post('/api/v1/trips/:id/end', auth, wrap(async (req, res) => {
    res.json({ trip: await deps.trips.end(req.principal, String(req.params.id)) });
  }));

  app.get('/api/v1/buses/:id/live', auth, wrap(async (req, res) => {
    res.json(await deps.live.snapshot(req.principal, String(req.params.id)));
  }));

  // Centralized errors: stable codes only, no stack traces or database messages.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) { res.status(err.status).json({ error: err.code, detail: err.status === 400 ? err.message : undefined }); return; }
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.too.large') { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return; }
    if (e?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_JSON' }); return; }
    console.error('[api] unhandled error', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  return app;
}
