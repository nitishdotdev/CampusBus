import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';

import { initDatabase, checkDatabaseHealth } from './server/db';
import { initSocketIO } from './server/socket';
import { getJwtSecret } from './server/middleware/auth';
import { resolveAllowedOrigins, buildCorsOptions } from './server/config/cors';
import authRoutes from './server/routes/auth';
import collegeRoutes from './server/routes/colleges';
import scheduleRoutes from "./server/routes/schedules";
import complaintRoutes from "./server/routes/complaints";
import busRoutes from './server/routes/buses';
import routeRoutes from './server/routes/routes';
import tripRoutes from './server/routes/trips';
import driverRoutes from './server/routes/driver';
import notificationRoutes from './server/routes/notifications';
import alertRoutes from './server/routes/alerts';
import analyticsRoutes from './server/routes/analytics';
import userRoutes from './server/routes/users';
import assignmentRoutes from './server/routes/assignments';

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  // Fail fast: in production this throws if JWT_SECRET is missing or weak.
  getJwtSecret();

  const app = express();
  const server = http.createServer(app);

  // Enable trust proxy for reverse-proxy environments (Cloud Run, Nginx, Render)
  app.set('trust proxy', 1);

  // Initialize Database (PostgreSQL if DATABASE_URL provided, else robust file-backed engine)
  const dbStatus = await initDatabase();
  console.log(`Database initialized: mode=${dbStatus.isPostgres ? 'PostgreSQL' : 'Embedded File Persistence'}`);

  // CORS: explicit allowlist from CORS_ORIGIN (see server/config/cors.ts)
  const allowedOrigins = resolveAllowedOrigins();
  console.log(`CORS allowlist: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(none: same-origin only)'}`);
  app.use(cors(buildCorsOptions(allowedOrigins)));

  // Body parser
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Endpoint-specific security rate limiters (Task 2.6)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15-minute window
    max: 30, // 30 attempts per 15 min per IP to prevent brute-force attacks
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });

  const gpsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300, // 300 req/min = 5 req/sec (plenty for phone GPS + batch sync while preventing DoS)
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Too many GPS telemetry reports. Throttling.' },
  });

  const emergencyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15, // 15 req/min per client (protects dispatcher from alert flooding)
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Too many emergency requests. Please contact campus security directly.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120, // 120 req/min for general API traffic
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Too many requests from this client. Please retry in a moment.' },
  });

  // Mount specific limiters before general /api/ limiter
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/driver/location', gpsLimiter);
  app.use('/api/driver/emergency', emergencyLimiter);
  app.use('/api/', apiLimiter);

  // Initialize Socket.IO Real-Time Engine with matched allowed origins
  initSocketIO(server, allowedOrigins);
  console.log('Socket.IO real-time engine attached.');

  // API Routes FIRST
  app.get('/api/health', async (_req, res) => {
    const health = await checkDatabaseHealth();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json({
      status: health.healthy ? 'ok' : 'degraded',
      service: 'Smart Campus Bus Backend API',
      database: health.database,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      ...(health.error ? { error: health.error } : {}),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/colleges', collegeRoutes);
  app.use('/api/buses', busRoutes);
  app.use('/api/routes', routeRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/driver', driverRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/users', userRoutes);
  app.use("/api/schedules", scheduleRoutes);
  app.use("/api/complaints", complaintRoutes);
  app.use('/api/assignments', assignmentRoutes);

  // Development vs Production Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting Vite middleware in development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static bundle from dist/...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error occurred.' });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Smart Campus Bus server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
