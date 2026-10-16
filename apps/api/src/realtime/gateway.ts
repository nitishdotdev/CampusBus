import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createOriginCheck } from '../../../../server/config/cors';
import { DomainError } from '../domain/errors';
import type { LiveService } from '../domain/live';
import type { LiveEmitter, Principal } from '../domain/types';
import type { VerifiedPrincipal } from '../auth/tokens';

const MAX_SUBSCRIPTIONS_PER_SOCKET = 20;
export const busRoom = (campusId: string, busId: string) => `bus:${campusId}:${busId}`;

export function createGateway(httpServer: HttpServer, deps: {
  verifyToken: (token: string) => VerifiedPrincipal | null; live: LiveService; allowedOrigins: string[];
}) {
  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: { origin: createOriginCheck(deps.allowedOrigins), credentials: true },
  });

  // Authentication: token comes from the handshake `auth` payload only (never the URL, which ends up in logs).
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const p = typeof token === 'string' ? deps.verifyToken(token) : null;
    if (!p) return next(new Error('UNAUTHENTICATED'));
    socket.data.principal = p;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const principal = socket.data.principal as VerifiedPrincipal;
    // No automatic room membership: every room must be requested and individually authorized.
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, principal.exp * 1000 - Date.now()));
    socket.on('disconnect', () => clearTimeout(expiryTimer));

    const asPrincipal: Principal = { userId: principal.userId, campusId: principal.campusId, role: principal.role };

    socket.on('subscribe:bus', async (msg: unknown, ack?: (r: unknown) => void) => {
      try {
        const busId = (msg as { busId?: unknown } | null)?.busId;
        if (typeof busId !== 'string') throw new DomainError(400, 'INVALID_REQUEST');
        const joined = [...socket.rooms].filter((r) => r.startsWith('bus:')).length;
        if (joined >= MAX_SUBSCRIPTIONS_PER_SOCKET) throw new DomainError(429, 'TOO_MANY_SUBSCRIPTIONS');
        const snapshot = await deps.live.snapshot(asPrincipal, busId); // authorizes, then reads
        await socket.join(busRoom(asPrincipal.campusId, busId));
        ack?.({ ok: true, snapshot });
        socket.emit('bus:snapshot', snapshot);
      } catch (e) {
        ack?.({ ok: false, error: e instanceof DomainError ? e.code : 'INTERNAL_ERROR' });
      }
    });

    socket.on('unsubscribe:bus', async (msg: unknown) => {
      const busId = (msg as { busId?: unknown } | null)?.busId;
      if (typeof busId === 'string') await socket.leave(busRoom(asPrincipal.campusId, busId));
    });
  });

  const emitter: LiveEmitter = {
    emitLocation(campusId, busId, payload) { io.to(busRoom(campusId, busId)).emit('bus:location', payload); },
  };
  return { io, emitter, close: () => new Promise<void>((r) => { io.close(() => r()); }) };
}
