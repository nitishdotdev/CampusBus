import express from 'express';
import cors from 'cors';
import { resolveAllowedOrigins, buildCorsOptions } from '../server/config/cors';
import { initDatabase, checkDatabaseHealth } from '../server/db';
import authRoutes from '../server/routes/auth';
import collegeRoutes from '../server/routes/colleges';
import busRoutes from '../server/routes/buses';
import routeRoutes from '../server/routes/routes';
import tripRoutes from '../server/routes/trips';
import driverRoutes from '../server/routes/driver';
import notificationRoutes from '../server/routes/notifications';
import alertRoutes from '../server/routes/alerts';
import analyticsRoutes from '../server/routes/analytics';

const app = express();

app.set('trust proxy', 1);

app.use(cors(buildCorsOptions(resolveAllowedOrigins())));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Normalize request URL for Vercel Lambda function environment
app.use((req, _res, next) => {
  if (!req.url.startsWith('/api/') && req.url !== '/api') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

let isDbInitialized = false;

app.use(async (_req, _res, next) => {
  if (!isDbInitialized) {
    try {
      await initDatabase();
      isDbInitialized = true;
    } catch (err) {
      console.error('API DB init notice:', err);
    }
  }
  next();
});

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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error occurred.' });
});

export default app;
