import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createOriginCheck } from '../config/cors';
import { DomainError } from '../domain/errors';
import type { LiveService } from '../domain/live';
import type { LiveEmitter, Principal } from '../domain/types';
import type { VerifiedPrincipal } from '../auth/tokens';

const MAX_SUBSCRIPTIONS_PER_SOCKET = 20;
/** How often open sockets are re-checked against their session. Bounds how long a logged-out socket stays connected. */
const SESSION_RECHECK_MS = 60_000;
export const busRoom = (campusId: string, busId: string) => `bus:${campusId}:${busId}`;

export function createGateway(httpServer: HttpServer, deps: {
  verifyToken: (token: string) => VerifiedPrincipal | null;
  isSessionActive: (sessionId: string) => Promise<boolean>;
  live: LiveService; allowedOrigins: string[];
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
    deps.isSessionActive(p.sessionId).then(active => {
      if (!active) return next(new Error('SESSION_REVOKED'));
      socket.data.principal = p;
      next();
    }, next);
  });

  // Sockets opened before a logout keep their handshake, so they are re-checked on a timer.
  const sessionSweep = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      const p = socket.data.principal as VerifiedPrincipal | undefined;
      if (!p) continue;
      deps.isSessionActive(p.sessionId).then(active => { if (!active) socket.disconnect(true); }, () => { /* retried next sweep */ });
    }
  }, SESSION_RECHECK_MS);
  sessionSweep.unref();

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
  return { io, emitter, close: () => new Promise<void>((r) => { clearInterval(sessionSweep); io.close(() => r()); }) };
}
