import { io, type Socket } from 'socket.io-client';
import { readViteV1Env, resolveV1ApiBase } from './apiBase';
import { v1Token } from './client';

const getSocketBase = (): string => resolveV1ApiBase(readViteV1Env((import.meta as any).env));

export interface BusLocationPayload {
  busId: string; campusId: string; tripId: string;
  location: { lat: number; lng: number };
  accuracyM: number | null; speedMps: number | null;
  headingDeg: number | null; capturedAt: string; receivedAt: string;
  freshness: 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'ENDED';
}

type LocationListener = (payload: BusLocationPayload) => void;

class SocketV1Service {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<LocationListener>>();
  private subscribedBusIds = new Set<string>();

  connect(): void {
    if (this.socket?.connected) return;
    const token = v1Token.getAccess();
    if (!token) return;

    this.socket = io(getSocketBase(), {
      path: '/socket.io/',
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.info('[socketV1] connected');
      // Resubscribe after reconnect
      for (const busId of this.subscribedBusIds) {
        this.socket!.emit('subscribe:bus', { busId });
      }
    });

    this.socket.on('bus:location', (payload: BusLocationPayload) => {
      const set = this.listeners.get(payload.busId);
      if (set) for (const fn of set) fn(payload);
    });

    this.socket.on('bus:snapshot', (payload: BusLocationPayload) => {
      const set = this.listeners.get(payload.busId);
      if (set) for (const fn of set) fn(payload);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[socketV1] connect_error', err.message);
    });
  }

  subscribeTobus(busId: string, fn: LocationListener): () => void {
    if (!this.listeners.has(busId)) this.listeners.set(busId, new Set());
    this.listeners.get(busId)!.add(fn);
    this.subscribedBusIds.add(busId);

    if (this.socket?.connected) {
      this.socket.emit('subscribe:bus', { busId });
    }

    return () => {
      this.listeners.get(busId)?.delete(fn);
      if (this.listeners.get(busId)?.size === 0) {
        this.listeners.delete(busId);
        this.subscribedBusIds.delete(busId);
        this.socket?.emit('unsubscribe:bus', { busId });
      }
    };
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.subscribedBusIds.clear();
  }
}

export const socketV1 = new SocketV1Service();
