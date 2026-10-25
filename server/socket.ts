import { createOriginCheck } from './config/cors';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from './middleware/auth';

let io: SocketIOServer | null = null;

export function initSocketIO(server: HttpServer, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: createOriginCheck(allowedOrigins),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // Socket.IO authentication middleware
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization;

    let token = typeof rawToken === 'string' ? rawToken : '';
    if (token.startsWith('Bearer ')) {
      token = token.slice(7).trim();
    }

    if (!token) {
      return next(new Error('Authentication error: Token required.'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Authentication error: Invalid or expired token.'));
    }

    // Attach verified identity to socket data
    socket.data.user = decoded;
    socket.data.collegeId = decoded.collegeId;
    socket.data.role = decoded.role;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    const collegeId = socket.data.collegeId;
    const userRole = socket.data.role;

    // Join tenant room strictly for user's verified college
    if (collegeId) {
      socket.join(`college:${collegeId}`);
      if (userRole === 'ADMIN') {
        socket.join(`college:${collegeId}:admin`);
      }
    }

    // Enforce tenant isolation on explicit college join requests
    socket.on('join:college', (targetCollegeId: string) => {
      if (!targetCollegeId || targetCollegeId !== collegeId) {
        socket.emit('error', {
          code: 'FORBIDDEN_CROSS_TENANT',
          message: 'Cross-college socket subscription is unauthorized.',
        });
        return;
      }

      // Re-verify room membership
      socket.join(`college:${collegeId}`);
      if (userRole === 'ADMIN') {
        socket.join(`college:${collegeId}:admin`);
      }
    });

    socket.on('disconnect', () => {
      // Disconnected
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function normalizeBusForClient(bus: any): any {
  if (!bus || typeof bus !== 'object') return bus;
  return {
    ...bus,
    id: bus.id,
    collegeId: bus.collegeId || bus.college_id,
    busNumber: bus.busNumber || bus.bus_number || 'BUS-UNKNOWN',
    plateNumber: bus.plateNumber || bus.plate_number || '',
    capacity: bus.capacity || 45,
    model: bus.model || 'Campus Transit Shuttle',
    currentRouteId: bus.currentRouteId !== undefined ? bus.currentRouteId : bus.current_route_id,
    currentDriverId: bus.currentDriverId !== undefined ? bus.currentDriverId : bus.current_driver_id,
    driverName: bus.driverName || bus.driver_name,
    status: bus.status === 'OFF_DUTY' ? 'IDLE' : bus.status === 'OUT_OF_SERVICE' ? 'OFFLINE' : (bus.status || 'IDLE'),
    lastLocation: bus.lastLocation || (bus.last_location_lat != null && bus.last_location_lng != null ? {
      lat: Number(bus.last_location_lat),
      lng: Number(bus.last_location_lng),
      speed: bus.speed_kmh ? bus.speed_kmh / 3.6 : 0,
      heading: bus.heading || 0,
      timestamp: bus.last_sync_timestamp || new Date().toISOString(),
    } : undefined),
    heading: bus.heading !== undefined ? bus.heading : 0,
    speedKmh: bus.speed_kmh !== undefined ? bus.speed_kmh : (bus.speedKmh || 0),
    currentOccupancy: bus.current_occupancy !== undefined ? bus.current_occupancy : (bus.currentOccupancy || 0),
    gpsStatus: bus.gps_status || bus.gpsStatus || 'GPS_ACTIVE',
    networkStatus: bus.network_status || bus.networkStatus || 'NETWORK_ONLINE',
    etaConfidence: bus.eta_confidence || bus.etaConfidence || 'LIVE',
    isSimulated: Boolean(bus.is_simulated ?? bus.isSimulated),
    lastSyncTimestamp: bus.last_sync_timestamp || bus.lastSyncTimestamp || new Date().toISOString(),
    currentStopId: bus.currentStopId !== undefined ? bus.currentStopId : (bus.current_stop_id ?? null),
    nextStopId: bus.nextStopId !== undefined ? bus.nextStopId : (bus.next_stop_id ?? null),
    completedStopIds: bus.completedStopIds || bus.completed_stop_ids || [],
    upcomingEtas: bus.upcomingEtas,
    nextStop: bus.nextStop,
    etaToNextStopSeconds: bus.nextStop?.etaMinutes
      ? bus.nextStop.etaMinutes * 60
      : bus.etaToNextStopSeconds ?? (bus.upcomingEtas?.[0]?.etaMinutes ? bus.upcomingEtas[0].etaMinutes * 60 : undefined),
  };
}

// Broadcasting Helpers
export function broadcastBusUpdate(collegeId: string, busData: any) {
  if (!io) return;
  const payload = normalizeBusForClient(busData);
  io.to(`college:${collegeId}`).emit('bus:updated', payload);
}

export function broadcastBusLocation(collegeId: string, locationData: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('bus:location', locationData);
}

export function broadcastOccupancyUpdate(collegeId: string, data: { busId: string; tripId?: string; currentOccupancy: number; capacity: number }) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('bus:occupancy', data);
}

export function broadcastTripStarted(collegeId: string, tripData: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('trip:started', tripData);
}

export function broadcastTripEnded(collegeId: string, tripData: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('trip:ended', tripData);
}

export function broadcastStopProgression(collegeId: string, progressionData: {
  tripId: string;
  busId: string;
  routeId: string;
  arrivedStop: { id: string; name: string; sequence: number };
  nextStop: { id: string; name: string; sequence: number } | null;
  completedStopIds: string[];
  timestamp: string;
}) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('trip:stop_arrived', progressionData);
}

export function broadcastStopApproaching(collegeId: string, approachingData: {
  tripId: string;
  busId: string;
  stopId: string;
  stopName: string;
  distanceM: number;
}) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('trip:stop_approaching', approachingData);
}

export function broadcastEmergencyAlert(collegeId: string, alert: any) {
  if (!io) return;
  // Broadcast to all college members so safety banner can alert them
  io.to(`college:${collegeId}`).emit('emergency:alert', alert);
  // Also target the admin room with priority sound/badge
  io.to(`college:${collegeId}:admin`).emit('emergency:admin_alert', alert);
}

export function broadcastEmergencyStatus(collegeId: string, data: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('emergency:status', data);
}

export function broadcastNotification(collegeId: string, notif: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('notification:new', notif);
}
