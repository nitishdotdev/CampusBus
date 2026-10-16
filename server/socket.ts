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

// Broadcasting Helpers
export function broadcastBusUpdate(collegeId: string, busData: any) {
  if (!io) return;
  io.to(`college:${collegeId}`).emit('bus:updated', busData);
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
