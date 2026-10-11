export type Role = 'STUDENT' | 'DRIVER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TripMode = 'REAL' | 'SIMULATED';
export type SpeedSource = 'device' | 'derived' | 'unavailable';

/** Identity established by the authentication layer. Never taken from request bodies. */
export interface Principal { userId: string; campusId: string; role: Role }

export interface UserDTO {
  id: string; campusId: string; role: Role; status: UserStatus;
  assignedBusId?: string | null; assignedRouteId?: string | null;
}
export interface BusDTO {
  id: string; campusId: string; number: string; capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE'; driverId?: string | null; routeId?: string | null;
}
export interface TripDTO {
  id: string; campusId: string; busId: string; driverId: string; routeId: string;
  status: TripStatus; mode: TripMode; startedAt: Date; endedAt?: Date | null;
}
export interface GeoPoint { lat: number; lng: number }
export interface TelemetryRecord {
  campusId: string; tripId: string; busId: string; driverId: string; eventId: string;
  location: GeoPoint; accuracyM: number | null; speedMps: number | null; speedSource: SpeedSource;
  headingDeg: number | null; capturedAt: Date; receivedAt: Date;
  liveEligible: boolean; lateSync: boolean; mode: TripMode;
}
export interface VehicleLocationDTO {
  campusId: string; busId: string; tripId: string; location: GeoPoint; accuracyM: number | null;
  speedMps: number | null; speedSource: SpeedSource; headingDeg: number | null;
  capturedAt: Date; receivedAt: Date; mode: TripMode;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

// ---- Ports: business logic depends on these, never on Mongoose ----
export interface UserRepository { findById(campusId: string, id: string): Promise<UserDTO | null> }
export interface BusRepository {
  findById(campusId: string, id: string): Promise<BusDTO | null>;
  list(campusId: string, opts: { page?: number; pageSize?: number }): Promise<Page<BusDTO>>;
}
export interface TripRepository {
  findById(campusId: string, id: string): Promise<TripDTO | null>;
  findActiveByBus(campusId: string, busId: string): Promise<TripDTO | null>;
  /** Atomic: throws DomainError 409 if the bus or driver already has an active trip. */
  start(t: { campusId: string; busId: string; driverId: string; routeId: string; mode: TripMode; startedAt: Date }): Promise<TripDTO>;
  /** Atomic: only an ACTIVE trip can end. Returns null when it was not active. */
  end(campusId: string, id: string, endedAt: Date, status?: 'COMPLETED' | 'CANCELLED'): Promise<TripDTO | null>;
  list(campusId: string, opts: { driverId?: string; page?: number; pageSize?: number }): Promise<Page<TripDTO>>;
}
export interface VehicleLocationRepository {
  /** Atomic conditional write: replaces the stored position only when `loc.capturedAt` is strictly newer. */
  applyIfNewer(loc: VehicleLocationDTO): Promise<boolean>;
  getByBus(campusId: string, busId: string): Promise<VehicleLocationDTO | null>;
}
export interface TelemetryRepository {
  insertIdempotent(rec: TelemetryRecord): Promise<'inserted' | 'duplicate'>;
  findLatestBefore(tripId: string, before: Date): Promise<TelemetryRecord | null>;
  listByTrip(tripId: string, opts: { page?: number; pageSize?: number }): Promise<{ items: TelemetryRecord[]; total: number }>;
  purgeReceivedBefore(cutoff: Date): Promise<number>;
}
export interface LiveEmitter { emitLocation(campusId: string, busId: string, payload: unknown): void }
