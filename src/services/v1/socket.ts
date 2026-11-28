import { io, type Socket } from 'socket.io-client';
import { readViteV1Env, resolveV1ApiBase } from './apiBase';
import { refreshV1Session, v1Token } from './client';

const getSocketBase = (): string => resolveV1ApiBase(readViteV1Env(import.meta.env));

interface LocationFix {
  lat: number; lng: number;
  accuracyM: number | null; speedMps: number | null;
  headingDeg: number | null; capturedAt: string; receivedAt: string;
  mode: 'REAL' | 'SIMULATED';
  /** Stop progression as of this fix. Present on live updates; absent on snapshots that predate it. */
  progress?: { nextStopId: string | null; completedStopIds: string[] };
}
export type TrackingFreshness = 'LIVE' | 'STALE' | 'DRIVER_OFFLINE' | 'TRIP_ENDED' | 'UNAVAILABLE';
export interface BusLocationPayload extends Omit<LocationFix, 'lat' | 'lng'> {
  busId: string; tripId: string;
  location: { lat: number; lng: number };
  freshness: TrackingFreshness;
}

type LocationListener = (payload: BusLocationPayload) => void;
type PositionMessage = LocationFix & { busId: string; tripId: string; freshness: TrackingFreshness };
type SnapshotMessage = { busId: string; tripId: string | null; position: LocationFix | null; freshness: TrackingFreshness };

class SocketV1Service {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<LocationListener>>();
  private resumeWhenOnline = () => {
    if (this.socket && !this.socket.active) this.socket.connect();
  };

  connect(): void {
    if (this.socket || !v1Token.getAccess()) return;

    const socket = io(getSocketBase(), {
      path: '/socket.io/',
      auth: callback => callback({ token: v1Token.getAccess() }),
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnectionAttempts: 10,
    });
    this.socket = socket;
    window.addEventListener('online', this.resumeWhenOnline);

    socket.on('connect', () => {
      for (const busId of this.listeners.keys()) socket.emit('subscribe:bus', { busId });
    });
    socket.on('bus:location', ({ busId, tripId, freshness, ...fix }: PositionMessage) => {
      this.deliver(busId, tripId, freshness, fix);
    });
    socket.on('bus:snapshot', ({ busId, tripId, position, freshness }: SnapshotMessage) => {
      if (position && tripId && freshness !== 'TRIP_ENDED') this.deliver(busId, tripId, freshness, position);
    });

    const reconnect = async () => {
      if (await refreshV1Session() && this.socket === socket && !socket.connected) socket.connect();
    };
    socket.on('disconnect', reason => {
      if (reason === 'io server disconnect') void reconnect();
    });
    socket.on('connect_error', error => {
      if (error.message === 'UNAUTHENTICATED') void reconnect();
    });
  }

  private deliver(busId: string, tripId: string, freshness: TrackingFreshness, { lat, lng, ...fix }: LocationFix) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    for (const listener of this.listeners.get(busId) ?? []) {
      listener({ busId, tripId, freshness, location: { lat, lng }, ...fix });
    }
  }

  subscribeTobus(busId: string, listener: LocationListener): () => void {
    let listeners = this.listeners.get(busId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(busId, listeners);
      if (this.socket?.connected) this.socket.emit('subscribe:bus', { busId });
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.listeners.get(busId) === listeners) {
        this.listeners.delete(busId);
        this.socket?.emit('unsubscribe:bus', { busId });
      }
    };
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    window.removeEventListener('online', this.resumeWhenOnline);
    this.listeners.clear();
  }
}

export const socketV1 = new SocketV1Service();
