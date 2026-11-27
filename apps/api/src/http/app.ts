import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { accountStatus, assignment, busCreate, busPatch, driverAssignment, emptyBody, idParam, routeAssignment, routeCreate, routePatch, scheduleCreate, schedulePatch, transport } from './validation';
import { buildCorsOptions } from '../config/cors';
import { bootstrapAdminSchema, passwordSchema, type AuthService } from '../auth/service';
import { canViewBus } from '../domain/access';
import { DomainError } from '../domain/errors';
import type { LiveService } from '../domain/live';
import type { TelemetryIngestService } from '../domain/telemetry/ingest';
import type { TripService } from '../domain/trips';
import type { BusRepository, CampusRepository, ComplaintRepository, Principal, Role, RouteRepository, ScheduleRepository, NotificationRepository, EmergencyAlertRepository, TripRepository, UserRepository } from '../domain/types';

export interface AppDeps {
  ingest: TelemetryIngestService; trips: TripService; live: LiveService; auth: AuthService;
  users: UserRepository; buses: BusRepository; routes: RouteRepository; tripRepo: TripRepository;
  campuses?: CampusRepository;
  complaints?: ComplaintRepository;
  schedules?: ScheduleRepository;
  notifications?: NotificationRepository;
  alerts?: EmergencyAlertRepository;
  bootstrapSecret?: string;
  verifyActiveAccount?: boolean;
  checkReadiness?: () => Promise<void>;
  trustProxy?: number;
  verifyToken: (token: string) => Principal | null; allowedOrigins: string[];
}
type AuthedRequest = Request & { principal: Principal };

// ─── Shared schemas ──────────────────────────────────────────────────────────
const startTripSchema = z.object({ busId: z.string().regex(/^[a-f0-9]{24}$/i), simulated: z.boolean().optional() }).strict();
const pageQuery = z.object({ page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  if (deps.trustProxy !== undefined) app.set('trust proxy', deps.trustProxy);
  app.use(cors(buildCorsOptions(deps.allowedOrigins)));
  app.use(express.json({ limit: '64kb' }));

  // ─── Health ────────────────────────────────────────────────────────────────
  app.get('/healthz', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await deps.checkReadiness?.();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // ─── Auth middleware ───────────────────────────────────────────────────────
  const auth: RequestHandler = (req, res, next) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const principal = token ? deps.verifyToken(token) : null;
    if (!principal) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return; }
    (req as AuthedRequest).principal = principal;
    if (!deps.verifyActiveAccount) { next(); return; }
    void deps.users.findById(principal.campusId, principal.userId).then(user => {
      if (user?.status !== 'ACTIVE' || user.role !== principal.role) {
        res.status(403).json({ error: 'ACCOUNT_NOT_ACTIVE' });
      } else {
        next();
      }
    }).catch(next);
  };
  const requireRole = (...roles: Role[]): RequestHandler => (req, res, next) => {
    const p = (req as AuthedRequest).principal;
    if (!roles.includes(p?.role)) { res.status(403).json({ error: 'FORBIDDEN' }); return; }
    next();
  };
  const requireDriver: RequestHandler = (req, res, next) => {
    const p = (req as AuthedRequest).principal;
    if (p?.role !== 'DRIVER') { res.status(403).json({ error: 'DRIVER_ROLE_REQUIRED' }); return; }
    next();
  };
  const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
    (req, res, next) => { fn(req as AuthedRequest, res).catch(next); };

  const validateTransport = async (campusId: string, busId?: string | null, routeId?: string | null) => {
    const [bus, route] = await Promise.all([
      busId ? deps.buses.findById(campusId, busId) : null,
      routeId ? deps.routes.findById(campusId, routeId) : null,
    ]);
    if (busId && !bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    if (routeId && !route) throw new DomainError(404, 'ROUTE_NOT_FOUND');
  };

  // ─── Campuses (public list; create is bootstrap-secret only) ───────────────
  const campusBody = z.object({
    name:      z.string().min(2).max(120),
    shortCode: z.string().min(2).max(16),
    city:      z.string().max(120).default(''),
    lat:       z.number().min(-90).max(90),
    lng:       z.number().min(-180).max(180),
    zoom:      z.number().int().min(1).max(20).default(15),
    timezone:  z.string().max(50).refine(timezone => {
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return true; }
      catch { return false; }
    }, 'Use a valid IANA time zone').default('UTC'),
  }).strict();
  app.get('/api/v1/campuses', wrap(async (_req, res) => {
    if (!deps.campuses) { res.status(500).json({ error: 'INTERNAL_ERROR' }); return; }
    res.json(await deps.campuses.list());
  }));
  app.post('/api/v1/campuses', wrap(async (req, res) => {
    const secret = deps.bootstrapSecret ?? '';
    if (!secret || req.headers['x-bootstrap-secret'] !== secret) {
      res.status(403).json({ error: 'FORBIDDEN' }); return;
    }
    if (!deps.campuses) { res.status(500).json({ error: 'INTERNAL_ERROR' }); return; }
    const body = campusBody.parse(req.body);
    res.status(201).json(await deps.campuses.create(body));
  }));

  app.patch('/api/v1/campuses/settings', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { campusId, userId } = req.principal;
    const actor = await deps.users.findById(campusId, userId);
    if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new DomainError(403, 'FORBIDDEN');
    const body = z.strictObject({
      name: z.string().trim().min(2).max(120),
      dispatchPhone: z.string().trim().min(3).max(32).regex(/^[+\d ()-]+$/).nullable(),
      gpsIntervalSeconds: z.number().int().min(2).max(10),
    }).parse(req.body);
    const campus = await deps.campuses?.updateSettings?.(campusId, body);
    if (!campus) throw new DomainError(404, 'CAMPUS_NOT_FOUND');
    res.json(campus);
  }));

  // ─── Auth routes ─────────────────────────────────────────────────────────
  const ar = express.Router();
  ar.post('/register', wrap(async (req, res) => { res.status(201).json(await deps.auth.register(req.body)); }));
  ar.post('/login', wrap(async (req, res) => { res.json(await deps.auth.login(req.body)); }));
  ar.post('/bootstrap-admin', wrap(async (req, res) => {
    const secret = deps.bootstrapSecret ?? '';
    if (!secret || req.headers['x-bootstrap-secret'] !== secret) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    // The auth service also validates so its CLI has the same policy.
    const { campusId, email, password, name } = bootstrapAdminSchema.parse(req.body);
    res.status(201).json({ user: await deps.auth.bootstrapAdmin(campusId, email, password, name) });
  }));
  const refreshBody = z.strictObject({ refreshToken: z.string().min(1).max(256) });
  const otpSchema = z.string().regex(/^\d{6}$/);
  const reset = z.strictObject({ campusId: idParam, email: z.email().max(254) });
  ar.post('/refresh', wrap(async (req, res) => {
    res.json(await deps.auth.refresh(refreshBody.parse(req.body).refreshToken));
  }));
  ar.post('/logout', wrap(async (req, res) => {
    const { refreshToken } = refreshBody.partial().default({}).parse(req.body);
    if (refreshToken) await deps.auth.logout(refreshToken);
    res.status(204).send();
  }));
  ar.post('/logout-all', auth, wrap(async (req, res) => {
    emptyBody.parse(req.body);
    await deps.auth.logoutAll(req.principal);
    res.status(204).send();
  }));
  ar.post('/verify-email', auth, wrap(async (req, res) => {
    const { otp } = z.strictObject({ otp: otpSchema }).parse(req.body);
    await deps.auth.verifyEmail(req.principal.campusId, req.principal.userId, otp);
    res.status(204).send();
  }));
  ar.post('/resend-verification', auth, wrap(async (req, res) => {
    emptyBody.parse(req.body);
    const { campusId, userId } = req.principal;
    const user = await deps.users.findById(campusId, userId);
    if (!user) throw new DomainError(404, 'USER_NOT_FOUND');
    await deps.auth.sendVerification(campusId, userId, user.email, user.name);
    res.status(204).send();
  }));
  ar.post('/change-password', auth, wrap(async (req, res) => {
    const body = z.strictObject({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema }).parse(req.body);
    await deps.auth.changePassword(req.principal, body.currentPassword, body.newPassword);
    res.status(204).send();
  }));
  const resetLimiter = (limit: number) => rateLimit({
    windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'PASSWORD_RESET_RATE_LIMITED' },
  });
  ar.post('/request-password-reset', resetLimiter(15), wrap(async (req, res) => {
    const { campusId, email } = reset.parse(req.body);
    await deps.auth.requestPasswordReset(campusId, email);
    res.status(204).send();
  }));
  ar.post('/confirm-password-reset', resetLimiter(30), wrap(async (req, res) => {
    const { campusId, email, otp, newPassword } = reset.extend({ otp: otpSchema, newPassword: z.string().min(8).max(72) }).parse(req.body);
    await deps.auth.confirmPasswordReset(campusId, email, otp, newPassword);
    res.status(204).send();
  }));
  app.use('/api/v1/auth', ar);

  // ─── Telemetry ────────────────────────────────────────────────────────────
  app.post('/api/v1/telemetry', auth, requireDriver, wrap(async (req, res) => { res.json(await deps.ingest.ingest(req.principal, req.body)); }));

  // ─── Trips ───────────────────────────────────────────────────────────────
  app.post('/api/v1/trips/start', auth, requireRole('DRIVER'), wrap(async (req, res) => {
    const p = startTripSchema.safeParse(req.body);
    if (!p.success) throw new DomainError(400, 'INVALID_REQUEST');
    res.status(201).json({ trip: await deps.trips.start(req.principal, p.data) });
  }));
  app.post('/api/v1/trips/:id/end', auth, requireRole('DRIVER', 'ADMIN'), wrap(async (req, res) => {
    idParam.parse(req.params['id']);
    emptyBody.parse(req.body);
    res.json({ trip: await deps.trips.end(req.principal, req.params['id']!) });
  }));
  app.patch('/api/v1/trips/:id/occupancy', auth, requireRole('DRIVER'), wrap(async (req, res) => {
    const { delta } = z.strictObject({ delta: z.number().int().min(-200).max(200).refine(value => value !== 0) }).parse(req.body);
    const { campusId, userId } = req.principal;
    const trip = await deps.tripRepo.updateOccupancy?.(campusId, idParam.parse(req.params['id']), userId, delta);
    if (!trip) throw new DomainError(404, 'ACTIVE_TRIP_NOT_FOUND');
    res.json({ trip });
  }));
  app.get('/api/v1/trips', auth, wrap(async (req, res) => {
    const { page, pageSize, status } = pageQuery.extend({ status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional() }).parse(req.query);
    const p = req.principal;
    const opts = p.role === 'DRIVER' ? { driverId: p.userId, page, pageSize, status } : { page, pageSize, status };
    res.json(await deps.tripRepo.list(p.campusId, opts));
  }));

  // ─── Live position ────────────────────────────────────────────────────────
  app.get('/api/v1/buses/:id/live', auth, wrap(async (req, res) => {
    if (!idParam.safeParse(req.params['id']).success) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(await deps.live.snapshot(req.principal, req.params['id']!));
  }));

  // ─── Buses ───────────────────────────────────────────────────────────────
  const busRouter = express.Router();
  busRouter.get('/', auth, wrap(async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    const { campusId, userId } = req.principal;
    const [fleet, user] = await Promise.all([deps.buses.list(campusId, { page, pageSize }), deps.users.findById(campusId, userId)]);
    res.json({ ...fleet, items: fleet.items.map(bus => ({
      ...bus, canTrack: Boolean(user && canViewBus(req.principal, user, bus)),
      driverName: req.principal.role === 'ADMIN' || bus.driverId === userId ? bus.driverName : undefined,
      plateNumber: req.principal.role === 'ADMIN' || bus.driverId === userId ? bus.plateNumber : undefined,
    })) });
  }));
  busRouter.get('/:id', auth, wrap(async (req, res) => {
    const bus = await deps.buses.findById(req.principal.campusId, req.params['id']!);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const body = busCreate.parse(req.body);
    await validateTransport(req.principal.campusId, null, body.routeId);
    res.status(201).json(await deps.buses.create({ campusId: req.principal.campusId, ...body, driverId: null }));
  }));
  busRouter.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const bus = await deps.buses.update(req.principal.campusId, idParam.parse(req.params['id']), busPatch.parse(req.body));
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const ok = await deps.buses.delete(req.principal.campusId, idParam.parse(req.params['id']));
    if (!ok) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.status(204).send();
  }));
  busRouter.post('/:id/assign-driver', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { driverId } = driverAssignment.parse(req.body);
    if (driverId !== null) {
      const driver = await deps.users.findById(req.principal.campusId, driverId);
      if (!driver) throw new DomainError(404, 'DRIVER_NOT_FOUND');
      if (driver.role !== 'DRIVER') throw new DomainError(400, 'INVALID_DRIVER');
      if (driver.status !== 'ACTIVE') throw new DomainError(400, 'DRIVER_NOT_ACTIVE');
    }
    const bus = await deps.buses.assignDriver(req.principal.campusId, idParam.parse(req.params['id']), driverId);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.post('/:id/assign-route', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { routeId } = routeAssignment.parse(req.body);
    const { campusId } = req.principal;
    await validateTransport(campusId, null, routeId);
    const bus = await deps.buses.assignRoute(campusId, idParam.parse(req.params['id']), routeId);
    if (!bus) throw new DomainError(404, 'BUS_NOT_FOUND');
    res.json(bus);
  }));
  busRouter.patch('/:id/assignment', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    if (!deps.buses.assign) throw new DomainError(501, 'ASSIGNMENT_UNAVAILABLE');
    const body = assignment.parse(req.body);
    const bus = await deps.buses.assign(req.principal.campusId, idParam.parse(req.params['id']), body);
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
    const body = routeCreate.parse(req.body);
    res.status(201).json(await deps.routes.create({ campusId: req.principal.campusId, ...body, stops: body.stops.map(stop => ({ ...stop, id: '' })) }));
  }));
  routeRouter.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { stops, ...patch } = routePatch.parse(req.body);
    const r = await deps.routes.update(req.principal.campusId, idParam.parse(req.params['id']), { ...patch, stops: stops?.map(stop => ({ ...stop, id: '' })) });
    if (!r) throw new DomainError(404, 'ROUTE_NOT_FOUND');
    res.json(r);
  }));
  routeRouter.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const ok = await deps.routes.delete(req.principal.campusId, idParam.parse(req.params['id']));
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
  userRouter.post('/drivers', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    res.status(201).json({ user: await deps.auth.createDriver(req.principal, req.body) });
  }));
  userRouter.patch('/:id/status', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { status } = accountStatus.parse(req.body);
    const ok = await deps.users.updateStatus(req.principal.campusId, idParam.parse(req.params['id']), status);
    if (!ok) throw new DomainError(404, 'USER_NOT_FOUND');
    res.status(204).send();
  }));
  userRouter.post('/:id/reset-password', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { newPassword } = z.strictObject({ newPassword: passwordSchema }).parse(req.body);
    await deps.auth.resetManagedPassword(req.principal, idParam.parse(req.params['id']), newPassword);
    res.status(204).send();
  }));
  userRouter.post('/:id/assign-transport', auth, requireRole('ADMIN'), wrap(async (req, res) => {
    const { busId, routeId } = transport.parse(req.body);
    const { campusId } = req.principal;
    const id = idParam.parse(req.params['id']);
    const student = await deps.users.findById(campusId, id);
    if (!student || student.role !== 'STUDENT') throw new DomainError(404, 'STUDENT_NOT_FOUND');
    await validateTransport(campusId, busId, routeId);
    const ok = await deps.users.assignTransport(campusId, id, busId, routeId);
    if (!ok) throw new DomainError(404, 'USER_NOT_FOUND');
    res.status(204).send();
  }));
  app.use('/api/v1/users', userRouter);


  // ─── Schedules ─────────────────────────────────────────────────────────────
  const sch = deps.schedules;
  if (sch) {
    const sr = express.Router();
    sr.get('/', auth, wrap(async (req, res) => {
      const q = z.object({ routeId: z.string().optional(), day: z.coerce.number().int().min(0).max(6).optional(), active: z.enum(['true','false']).transform(v=>v==='true').optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await sch.list(req.principal.campusId, q));
    }));
    sr.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const body = scheduleCreate.parse(req.body);
      const { campusId } = req.principal;
      await validateTransport(campusId, body.busId, body.routeId);
      res.status(201).json(await sch.create({ campusId, ...body }));
    }));
    sr.patch('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const body = schedulePatch.parse(req.body);
      const { campusId } = req.principal;
      const id = idParam.parse(req.params['id']);
      await validateTransport(campusId, body.busId, body.routeId);
      const sc = await sch.update(campusId, id, body);
      if (!sc) throw new DomainError(404, 'SCHEDULE_NOT_FOUND');
      res.json(sc);
    }));
    sr.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      if (!await sch.delete(req.principal.campusId, idParam.parse(req.params['id']))) throw new DomainError(404, 'SCHEDULE_NOT_FOUND');
      res.status(204).send();
    }));
    app.use('/api/v1/schedules', sr);
  }

  // ─── Notifications ──────────────────────────────────────────────────────────
  const notif = deps.notifications;
  if (notif) {
    const nr = express.Router();
    nr.get('/', auth, wrap(async (req, res) => {
      const q = z.object({ routeId: z.string().optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await notif.list(req.principal.campusId, q));
    }));
    nr.post('/', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      const b = z.object({ kind: z.enum(['ANNOUNCEMENT','DELAY','ROUTE_CHANGE','EMERGENCY']), priority: z.enum(['NORMAL','HIGH','URGENT']).default('NORMAL'), title: z.string().min(3).max(160), body: z.string().min(1).max(2000), routeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), expiresAt: z.string().datetime().optional() }).strict().parse(req.body);
      if (b.routeId) await validateTransport(req.principal.campusId, null, b.routeId);
      res.status(201).json(await notif.create({ campusId: req.principal.campusId, createdBy: req.principal.userId, ...b, routeId: b.routeId ?? null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null }));
    }));
    nr.delete('/:id', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      if (!await notif.delete(req.principal.campusId, idParam.parse(req.params['id']))) throw new DomainError(404, 'NOTIFICATION_NOT_FOUND');
      res.status(204).send();
    }));
    app.use('/api/v1/notifications', nr);
  }

  // ─── Emergency alerts ───────────────────────────────────────────────────────
  const alerts = deps.alerts;
  if (alerts) {
    const alr = express.Router();
    alr.get('/', auth, requireRole('ADMIN', 'DRIVER'), wrap(async (req, res) => {
      const q = z.object({ status: z.enum(['OPEN','ACKNOWLEDGED','RESOLVED']).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
      res.json(await alerts.list(req.principal.campusId, q));
    }));
    alr.post('/', auth, requireRole('DRIVER'), wrap(async (req, res) => {
      const b = z.object({ busId: z.string().regex(/^[a-f0-9]{24}$/i), tripId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), message: z.string().max(1000).optional(), location: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional() }).strict().parse(req.body);
      const { campusId, userId } = req.principal;
      const bus = await deps.buses.findById(campusId, b.busId);
      if (!bus || bus.driverId !== userId) throw new DomainError(404, 'BUS_NOT_FOUND');
      if (b.tripId) {
        const trip = await deps.tripRepo.findById(campusId, b.tripId);
        if (!trip || trip.busId !== b.busId || trip.driverId !== userId || trip.status !== 'ACTIVE') {
          throw new DomainError(404, 'TRIP_NOT_FOUND');
        }
      }
      res.status(201).json(await alerts.create({ campusId: req.principal.campusId, raisedBy: req.principal.userId, status: 'OPEN', ...b, tripId: b.tripId ?? null, message: b.message ?? null, location: b.location ?? null, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null }));
    }));
    alr.post('/:id/acknowledge', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      emptyBody.parse(req.body);
      const a = await alerts.acknowledge(req.principal.campusId, idParam.parse(req.params['id']), req.principal.userId, new Date());
      if (!a) throw new DomainError(404, 'ALERT_NOT_FOUND_OR_ACKNOWLEDGED');
      res.json(a);
    }));
    alr.post('/:id/resolve', auth, requireRole('ADMIN'), wrap(async (req, res) => {
      emptyBody.parse(req.body);
      const a = await alerts.resolve(req.principal.campusId, idParam.parse(req.params['id']), req.principal.userId, new Date());
      if (!a) throw new DomainError(404, 'ALERT_NOT_FOUND_OR_RESOLVED');
      res.json(a);
    }));
    app.use('/api/v1/alerts', alr);
  }

  const complaints = deps.complaints;
  if (complaints) {
    const router = express.Router();
    const status = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
    const priority = z.enum(['LOW', 'NORMAL', 'HIGH']);
    const text = (max: number) => z.string().trim().min(1).max(max);
    const input = z.strictObject({
      title: text(160), description: text(4000),
      category: z.enum(['DRIVER_BEHAVIOR', 'VEHICLE_CONDITION', 'SCHEDULE_ISSUE', 'CLEANLINESS', 'SAFETY', 'OTHER']).default('OTHER'),
      priority: priority.default('NORMAL'),
      tripId: idParam.optional(), busId: idParam.optional(), routeId: idParam.optional(),
    });
    const update = z.strictObject({
      status: status.optional(), priority: priority.optional(), adminResponse: text(4000).optional(),
    }).refine(body => Object.keys(body).length > 0, 'Provide at least one field');
    router.use(auth, requireRole('STUDENT', 'ADMIN'), (req, res, next) => {
      const { campusId, userId, role } = (req as AuthedRequest).principal;
      void deps.users.findById(campusId, userId).then(user => {
        if (!user || user.status !== 'ACTIVE' || user.role !== role) {
          res.status(403).json({ error: 'ACCOUNT_NOT_ACTIVE' });
        } else next();
      }).catch(next);
    });
    router.get('/', wrap(async (req, res) => {
      const { campusId, userId, role } = req.principal;
      res.json(await complaints.list(campusId, role === 'STUDENT' ? userId : null, pageQuery.parse(req.query)));
    }));
    router.get('/:id', wrap(async (req, res) => {
      const { campusId, userId, role } = req.principal;
      const record = await complaints.find(campusId, idParam.parse(req.params['id']), role === 'STUDENT' ? userId : null);
      if (!record) throw new DomainError(404, 'COMPLAINT_NOT_FOUND');
      res.json(record);
    }));
    router.post('/', requireRole('STUDENT'), wrap(async (req, res) => {
      const body = input.parse(req.body);
      const { campusId, userId } = req.principal;
      const [bus, route, trip] = await Promise.all([
        body.busId ? deps.buses.findById(campusId, body.busId) : null,
        body.routeId ? deps.routes.findById(campusId, body.routeId) : null,
        body.tripId ? deps.tripRepo.findById(campusId, body.tripId) : null,
      ]);
      if ((body.busId && !bus) || (body.routeId && !route) || (body.tripId && !trip)) {
        throw new DomainError(404, 'TRANSPORT_REFERENCE_NOT_FOUND');
      }
      if (trip && ((bus && trip.busId !== bus.id) || (route && trip.routeId !== route.id))) {
        throw badReq('INCONSISTENT_TRANSPORT_REFERENCE');
      }
      res.status(201).json(await complaints.create({ ...body, campusId, studentId: userId }));
    }));
    router.patch('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
      const { campusId, userId } = req.principal;
      const record = await complaints.update(campusId, idParam.parse(req.params['id']), userId, update.parse(req.body));
      if (!record) throw new DomainError(404, 'COMPLAINT_NOT_FOUND');
      res.json(record);
    }));
    app.use('/api/v1/complaints', router);
  }

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }); });

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
