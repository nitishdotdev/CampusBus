import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { buildCorsOptions } from '../../../../server/config/cors';
import type { AuthService } from '../auth/service';
import { DomainError } from '../domain/errors';
import type { LiveService } from '../domain/live';
import type { TelemetryIngestService } from '../domain/telemetry/ingest';
import type { TripService } from '../domain/trips';
import type { BusRepository, Principal, Role, RouteRepository, TripRepository, UserRepository } from '../domain/types';

export interface AppDeps {
  ingest: TelemetryIngestService; trips: TripService; live: LiveService; auth: AuthService;
  users: UserRepository; buses: BusRepository; routes: RouteRepository; tripRepo: TripRepository;
  verifyToken: (token: string) => Principal | null; allowedOrigins: string[];
}
type AuthedRequest = Request & { principal: Principal };

// ─── Shared schemas ──────────────────────────────────────────────────────────
const startTripSchema = z.object({ busId: z.string().regex(/^[a-f0-9]{24}$/i), simulated: z.boolean().optional() }).strict();
const idParam = z.string().regex(/^[a-f0-9]{24}$/i);
const pageQuery = z.object({ page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(buildCorsOptions(deps.allowedOrigins)));
  app.use(express.json({ limit: '64kb' }));

  // ─── Health ────────────────────────────────────────────────────────────────
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // ─── Auth middleware ───────────────────────────────────────────────────────
  const auth: RequestHandler = (req, res, next) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const principal = token ? deps.verifyToken(token) : null;
    if (!principal) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return; }
    (req as AuthedRequest).principal = principal;
    next();
  };
  const requireRole = (...roles: Role[]): RequestHandler => (req, res, next) => {
    const p = (req as AuthedRequest).principal;
    if (!roles.includes(p?.role)) { res.status(403).json({ error: 'FORBIDDEN' }); return; }
    next();
  };
  const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
    (req, res, next) => { fn(req as AuthedRequest, res).catch(next); };

  // ─── Auth routes ─────────────────────────────────────────────────────────
  const ar = express.Router();
  ar.post('/register', async (req, res) => { res.status(201).json(await deps.auth.register(req.body)); });
  ar.post('/login', async (req, res) => { res.json(await deps.auth.login(req.body)); });
  ar.post('/refresh', async (req, res) => {
    const raw = req.body?.refreshToken;
    if (typeof raw !== 'string') throw badReq('MISSING_REFRESH_TOKEN');
    res.json(await deps.auth.refresh(raw));
  });
  ar.post('/logout', async (req, res) => {
    const raw = req.body?.refreshToken;
    if (typeof raw === 'string') await deps.auth.logout(raw);
    res.status(204).send();
  });
  ar.post('/logout-all', auth, async (req, res) => {
    await deps.auth.logoutAll((req as AuthedRequest).principal);
    res.status(204).send();
  });
  ar.post('/verify-email', auth, async (req, res) => {
    const { otp } = req.body ?? {};
    if (typeof otp !== 'string') throw badReq('MISSING_OTP');
    const p = (req as AuthedRequest).principal;
    await deps.auth.verifyEmail(p.campusId, p.userId, otp);
    res.status(204).send();
  });
  ar.post('/resend-verification', auth, async (req, res) => {
    const p = (req as AuthedRequest).principal;
    const user = await deps.users.findById(p.campusId, p.userId);
    if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    await deps.auth.sendVerification(p.campusId, p.userId, user.email, user.name);
    res.status(204).send();
  });
  ar.post('/request-password-reset', async (req, res) => {
    const { campusId, email } = req.body ?? {};
    if (typeof campusId === 'string' && typeof email === 'string') await deps.auth.requestPasswordReset(campusId, email);
    res.status(204).send(); // always 204
  });
  ar.post('/confirm-password-reset', async (req, res) => {
    const { campusId, email, otp, newPassword } = req.body ?? {};
    if (typeof campusId !== 'string' || typeof email !== 'string' || typeof otp !== 'string' || typeof newPassword !== 'string') throw badReq('INVALID_REQUEST');
    await deps.auth.confirmPasswordReset(campusId, email, otp, newPassword);
    res.status(204).send();
  });
  app.use('/api/v1/auth', ar);

  // ─── Telemetry ────────────────────────────────────────────────────────────
  app.post('/api/v1/telemetry', auth, requireRole('DRIVER'), wrap(async (req, res) => { res.json(await deps.ingest.ingest(req.principal, req.body)); }));

  // ─── Trips ───────────────────────────────────────────────────────────────
  app.post('/api/v1/trips/start', auth, requireRole('DRIVER'), wrap(async (req, res) => {
    const p = startTripSchema.safeParse(req.body);
    if (!p.success) throw new DomainError(400, 'INVALID_REQUEST');
    res.status(201).json({ trip: await deps.trips.start(req.principal, p.data) });
  }));
  app.post('/api/v1/trips/:id/end', auth, requireRole('DRIVER', 'ADMIN'), wrap(async (req, res) => {
    idParam.parse(req.params['id']);
    res.json({ trip: await deps.trips.end(req.principal, req.params['id']!) });
  }));
  app.get('/api/v1/trips', auth, wrap(async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    const p = req.principal;
    const opts = p.role === 'DRIVER' ? { driverId: p.userId, page, pageSize } : { page, pageSize };
    res.json(await deps.tripRepo.list(p.campusId, opts));
  }));

  // ─── Live position ────────────────────────────────────────────────────────
  app.get('/api/v1/buses/:id/live', auth, wrap(async (req, res) => {
    idParam.parse(req.params['id']);
    res.json(await deps.live.snapshot(req.principal, req.params['id']!));
  }));

  // ─── Buses ───────────────────────────────────────────────────────────────
  const busRouter = express.Router();
  busRouter.get('/', auth, wrap(async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(await deps.buses.list(req.principal.campusId, { page, pageSize }));
  }));
  busRouter.get('/:id', auth, wrap(async (req, res) => {
    const bus = await deps.buses.findById(req.principal.campusId, req.params['id']!);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const s = z.object({ number: z.string().min(1).max(32), capacity: z.number().int().min(1).max(200), status: z.enum(['ACTIVE', 'MAINTENANCE', 'OFFLINE']).default('ACTIVE') }).strict().parse(req.body);
    res.status(201).json(await deps.buses.create({ campusId: req.principal.campusId, ...s, driverId: null, routeId: null }));
  }));
  busRouter.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const bus = await deps.buses.update(req.principal.campusId, req.params['id']!, req.body);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const ok = await deps.buses.delete(req.principal.campusId, req.params['id']!);
    if (!ok) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.status(204).send();
  }));
  busRouter.post('/:id/assign-driver', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const bus = await deps.buses.assignDriver(req.principal.campusId, req.params['id']!, req.body?.driverId ?? null);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.post('/:id/assign-route', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const bus = await deps.buses.assignRoute(req.principal.campusId, req.params['id']!, req.body?.routeId ?? null);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  app.use('/api/v1/buses', busRouter);

  // ─── Routes ──────────────────────────────────────────────────────────────
  const routeRouter = express.Router();
  routeRouter.get('/', auth, wrap(async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(await deps.routes.list(req.principal.campusId, { page, pageSize }));
  }));
  routeRouter.get('/:id', auth, wrap(async (req, res) => {
    const r = await deps.routes.findById(req.principal.campusId, req.params['id']!);
    if (!r) throw new DomainError(404, 'ROUTE_NOT_FOUND');
    res.json(r);
  }));
  routeRouter.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const s = z.object({ code: z.string().min(1).max(16), name: z.string().min(1).max(120), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'), stops: z.array(z.object({ name: z.string().min(1).max(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), order: z.number().int().min(0) })).default([]) }).strict().parse(req.body);
    res.status(201).json(await deps.routes.create({ campusId: req.principal.campusId, ...s, stops: s.stops.map(st => ({ ...st, id: '' })) }));
  }));
  routeRouter.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const r = await deps.routes.update(req.principal.campusId, req.params['id']!, req.body);
    if (!r) throw new DomainError(404, 'ROUTE_NOT_FOUND');
    res.json(r);
  }));
  routeRouter.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const ok = await deps.routes.delete(req.principal.campusId, req.params['id']!);
    if (!ok) throw new DomainError(404, 'ROUTE_NOT_FOUND');
    res.status(204).send();
  }));
  app.use('/api/v1/routes', routeRouter);

  // ─── Users (admin management) ────────────────────────────────────────────
  const userRouter = express.Router();
  // /me must be registered before /:id to avoid being shadowed
  userRouter.get('/me', auth, wrap(async (req, res) => {
    const u = await deps.users.findById(req.principal.campusId, req.principal.userId);
    if (!u) throw new DomainError(404, 'USER_NOT_FOUND');
    res.json(u);
  }));
  userRouter.get('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const q = z.object({ role: z.enum(['STUDENT', 'DRIVER', 'ADMIN']).optional(), status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'DISABLED']).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    res.json(await deps.users.list(req.principal.campusId, q));
  }));
  userRouter.patch('/:id/status', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'PENDING', 'REJECTED', 'DISABLED']) }).parse(req.body);
    const ok = await deps.users.updateStatus(req.principal.campusId, req.params['id']!, status);
    if (!ok) throw new DomainError(404, 'USER_NOT_FOUND');
    res.status(204).send();
  }));
  userRouter.post('/:id/assign-transport', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { busId = null, routeId = null } = req.body ?? {};
    const ok = await deps.users.assignTransport(req.principal.campusId, req.params['id']!, busId, routeId);
    if (!ok) throw new DomainError(404, 'USER_NOT_FOUND');
    res.status(204).send();
  }));
  app.use('/api/v1/users', userRouter);


  // ─── Schedules ─────────────────────────────────────────────────────────────
  {
    const sr = express.Router();
    const sch = (deps as any).schedules as { list: Function; create: Function; update: Function; delete: Function };
    sr.get('/', auth, wrap(async (req, res) => {
      const q = z.object({ routeId: z.string().optional(), day: z.coerce.number().int().min(0).max(6).optional(), active: z.enum(['true','false']).transform(v=>v==='true').optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await sch.list(req.principal.campusId, q));
    }));
    sr.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const b = z.object({ routeId: z.string().regex(/^[a-f0-9]{24}$/i), busId: z.string().regex(/^[a-f0-9]{24}$/i), direction: z.enum(['TO_CAMPUS','FROM_CAMPUS']), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1), departTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), active: z.boolean().default(true) }).strict().parse(req.body);
      res.status(201).json(await sch.create({ campusId: req.principal.campusId, ...b }));
    }));
    sr.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const sc = await sch.update(req.principal.campusId, req.params['id']!, req.body);
      if (!sc) throw new DomainError(404, 'SCHEDULE_NOT_FOUND');
      res.json(sc);
    }));
    sr.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      if (!await sch.delete(req.principal.campusId, req.params['id']!)) throw new DomainError(404, 'SCHEDULE_NOT_FOUND');
      res.status(204).send();
    }));
    app.use('/api/v1/schedules', sr);
  }

  // ─── Notifications ──────────────────────────────────────────────────────────
  {
    const nr = express.Router();
    const notif = (deps as any).notifications as { list: Function; create: Function; delete: Function };
    nr.get('/', auth, wrap(async (req, res) => {
      const q = z.object({ routeId: z.string().optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await notif.list(req.principal.campusId, q));
    }));
    nr.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const b = z.object({ kind: z.enum(['ANNOUNCEMENT','DELAY','ROUTE_CHANGE','EMERGENCY']), priority: z.enum(['NORMAL','HIGH','URGENT']).default('NORMAL'), title: z.string().min(3).max(160), body: z.string().min(1).max(2000), routeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), expiresAt: z.string().datetime().optional() }).strict().parse(req.body);
      res.status(201).json(await notif.create({ campusId: req.principal.campusId, createdBy: req.principal.userId, ...b, routeId: b.routeId ?? null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null }));
    }));
    nr.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      if (!await notif.delete(req.principal.campusId, req.params['id']!)) throw new DomainError(404, 'NOTIFICATION_NOT_FOUND');
      res.status(204).send();
    }));
    app.use('/api/v1/notifications', nr);
  }

  // ─── Emergency alerts ───────────────────────────────────────────────────────
  {
    const alr = express.Router();
    const alerts = (deps as any).alerts as { list: Function; create: Function; acknowledge: Function; resolve: Function };
    alr.get('/', auth, requireRole('ADMIN', 'DRIVER'), wrap(async (req, res) => {
      const q = z.object({ status: z.enum(['OPEN','ACKNOWLEDGED','RESOLVED']).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await alerts.list(req.principal.campusId, q));
    }));
    alr.post('/', auth, requireRole('DRIVER'), wrap(async (req, res) => {
      const b = z.object({ busId: z.string().regex(/^[a-f0-9]{24}$/i), tripId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), message: z.string().max(1000).optional(), location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional() }).parse(req.body);
      res.status(201).json(await alerts.create({ campusId: req.principal.campusId, raisedBy: req.principal.userId, status: 'OPEN', ...b, tripId: b.tripId ?? null, message: b.message ?? null, location: b.location ?? null, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null }));
    }));
    alr.post('/:id/acknowledge', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const a = await alerts.acknowledge(req.principal.campusId, req.params['id']!, req.principal.userId, new Date());
      if (!a) throw new DomainError(404, 'ALERT_NOT_FOUND_OR_ACKNOWLEDGED');
      res.json(a);
    }));
    alr.post('/:id/resolve', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const a = await alerts.resolve(req.principal.campusId, req.params['id']!, req.principal.userId, new Date());
      if (!a) throw new DomainError(404, 'ALERT_NOT_FOUND_OR_RESOLVED');
      res.json(a);
    }));
    app.use('/api/v1/alerts', alr);
  }

  // ─── Error handler ────────────────────────────────────────────────────────
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) { res.status(err.status).json({ error: err.code, ...(err.status === 400 && err.message !== err.code ? { detail: err.message } : {}) }); return; }
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'VALIDATION_ERROR', detail: err.issues[0]?.message }); return; }
    const e = err as { type?: string };
    if (e?.type === 'entity.too.large') { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return; }
    if (e?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_JSON' }); return; }
    console.error('[api] unhandled', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  return app;
}

const badReq = (code: string) => new DomainError(400, code);
