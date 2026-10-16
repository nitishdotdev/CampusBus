export type Role = 'STUDENT' | 'DRIVER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TripMode = 'REAL' | 'SIMULATED';
export type SpeedSource = 'device' | 'derived' | 'unavailable';

/** Identity established by the authentication layer. Never taken from request bodies. */
export interface Principal { userId: string; campusId: string; role: Role }

export interface UserDTO {
  id: string; campusId: string; email: string; name: string; role: Role; status: UserStatus;
  emailVerifiedAt: Date | null; assignedBusId?: string | null; assignedRouteId?: string | null;
}
export interface BusDTO {
  id: string; campusId: string; number: string; capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE'; driverId?: string | null; routeId?: string | null;
}
export interface RouteDTO {
  id: string; campusId: string; code: string; name: string; color: string;
  stops: StopDTO[];
}
export interface StopDTO { id: string; name: string; lat: number; lng: number; order: number }
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

// ---- Auth types ----
export interface RegisterInput {
  campusId: string; email: string; password: string; name: string; role: Role;
}
export interface AuthTokens { accessToken: string; expiresIn: number }
export interface SessionInfo { userId: string; campusId: string; role: Role; name: string; email: string; status: UserStatus }

// ---- Ports ----
export interface UserRepository {
  findById(campusId: string, id: string): Promise<UserDTO | null>;
  findByEmail(campusId: string, email: string): Promise<(UserDTO & { passwordHash: string }) | null>;
  create(u: { campusId: string; email: string; passwordHash: string; name: string; role: Role; status: UserStatus }): Promise<UserDTO>;
  updateStatus(campusId: string, id: string, status: UserStatus): Promise<boolean>;
  verifyEmail(campusId: string, id: string, at: Date): Promise<boolean>;
  updatePassword(campusId: string, id: string, hash: string): Promise<boolean>;
  list(campusId: string, opts: { role?: Role; status?: UserStatus; page?: number; pageSize?: number }): Promise<Page<UserDTO>>;
  assignTransport(campusId: string, id: string, busId: string | null, routeId: string | null): Promise<boolean>;
}
export interface RefreshTokenRepository {
  /** Create a refresh token. familyId groups rotated tokens for theft detection. */
  create(t: { userId: string; campusId: string; tokenHash: string; familyId: string; expiresAt: Date; previousId?: string }): Promise<string>;
  find(tokenHash: string): Promise<{ id: string; userId: string; campusId: string; familyId: string; expiresAt: Date; revokedAt: Date | null; previousId: string | null } | null>;
  /** Revoke one token (used = normal rotation). */
  revoke(id: string, at: Date): Promise<void>;
  /** Revoke every live token in a family (theft detected). */
  revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Revoke all tokens for a user (logout everywhere). */
  revokeAll(userId: string, at: Date): Promise<void>;
  /** Remove tokens that expired before cutoff. */
  purgeExpired(cutoff: Date): Promise<number>;
}
export interface EmailTokenRepository {
  /** Upsert: one pending token per user per purpose. */
  upsert(t: { userId: string; campusId: string; purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD'; tokenHash: string; expiresAt: Date }): Promise<void>;
  find(tokenHash: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD'): Promise<{ userId: string; campusId: string; expiresAt: Date; usedAt: Date | null } | null>;
  markUsed(tokenHash: string, at: Date): Promise<void>;
}
export interface EmailSender {
  sendVerification(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
}
export interface BusRepository {
  findById(campusId: string, id: string): Promise<BusDTO | null>;
  list(campusId: string, opts: { page?: number; pageSize?: number }): Promise<Page<BusDTO>>;
  create(b: Omit<BusDTO, 'id'>): Promise<BusDTO>;
  update(campusId: string, id: string, patch: Partial<Omit<BusDTO, 'id' | 'campusId'>>): Promise<BusDTO | null>;
  delete(campusId: string, id: string): Promise<boolean>;
  assignDriver(campusId: string, id: string, driverId: string | null): Promise<BusDTO | null>;
  assignRoute(campusId: string, id: string, routeId: string | null): Promise<BusDTO | null>;
}
export interface RouteRepository {
  findById(campusId: string, id: string): Promise<RouteDTO | null>;
  list(campusId: string, opts: { page?: number; pageSize?: number }): Promise<Page<RouteDTO>>;
  create(r: Omit<RouteDTO, 'id'>): Promise<RouteDTO>;
  update(campusId: string, id: string, patch: Partial<Omit<RouteDTO, 'id' | 'campusId'>>): Promise<RouteDTO | null>;
  delete(campusId: string, id: string): Promise<boolean>;
}
export interface TripRepository {
  findById(campusId: string, id: string): Promise<TripDTO | null>;
  findActiveByBus(campusId: string, busId: string): Promise<TripDTO | null>;
  start(t: { campusId: string; busId: string; driverId: string; routeId: string; mode: TripMode; startedAt: Date }): Promise<TripDTO>;
  end(campusId: string, id: string, endedAt: Date, status?: 'COMPLETED' | 'CANCELLED'): Promise<TripDTO | null>;
  list(campusId: string, opts: { driverId?: string; busId?: string; status?: TripStatus; page?: number; pageSize?: number }): Promise<Page<TripDTO>>;
}
export interface VehicleLocationRepository {
  applyIfNewer(loc: VehicleLocationDTO): Promise<boolean>;
  getByBus(campusId: string, busId: string): Promise<VehicleLocationDTO | null>;
  listByCampus(campusId: string): Promise<VehicleLocationDTO[]>;
}
export interface TelemetryRepository {
  insertIdempotent(rec: TelemetryRecord): Promise<'inserted' | 'duplicate'>;
  findLatestBefore(tripId: string, before: Date): Promise<TelemetryRecord | null>;
  listByTrip(tripId: string, opts: { page?: number; pageSize?: number }): Promise<{ items: TelemetryRecord[]; total: number }>;
  purgeReceivedBefore(cutoff: Date): Promise<number>;
}
export interface LiveEmitter { emitLocation(campusId: string, busId: string, payload: unknown): void }

export type ScheduleDirection = 'TO_CAMPUS' | 'FROM_CAMPUS';
export interface ScheduleDTO {
  id: string; campusId: string; routeId: string; busId: string;
  direction: ScheduleDirection; daysOfWeek: number[]; departTime: string; active: boolean;
}
export type NotificationKind = 'ANNOUNCEMENT' | 'DELAY' | 'ROUTE_CHANGE' | 'EMERGENCY';
export type NotificationPriority = 'NORMAL' | 'HIGH' | 'URGENT';
export interface NotificationDTO {
  id: string; campusId: string; kind: NotificationKind; priority: NotificationPriority;
  title: string; body: string; routeId?: string | null; createdBy: string;
  expiresAt?: Date | null; createdAt: Date;
}
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export interface EmergencyAlertDTO {
  id: string; campusId: string; busId: string; tripId?: string | null;
  raisedBy: string; status: AlertStatus; message?: string | null;
  location?: GeoPoint | null; createdAt: Date;
  acknowledgedBy?: string | null; acknowledgedAt?: Date | null;
  resolvedBy?: string | null; resolvedAt?: Date | null;
}

export interface ScheduleRepository {
  findById(campusId: string, id: string): Promise<ScheduleDTO | null>;
  list(campusId: string, opts: { routeId?: string; day?: number; active?: boolean; page?: number; pageSize?: number }): Promise<Page<ScheduleDTO>>;
  create(s: Omit<ScheduleDTO, 'id'>): Promise<ScheduleDTO>;
  update(campusId: string, id: string, patch: Partial<Omit<ScheduleDTO, 'id' | 'campusId'>>): Promise<ScheduleDTO | null>;
  delete(campusId: string, id: string): Promise<boolean>;
}
export interface NotificationRepository {
  list(campusId: string, opts: { routeId?: string; page?: number; pageSize?: number }): Promise<Page<NotificationDTO>>;
  create(n: Omit<NotificationDTO, 'id' | 'createdAt'>): Promise<NotificationDTO>;
  delete(campusId: string, id: string): Promise<boolean>;
}
export interface EmergencyAlertRepository {
  list(campusId: string, opts: { status?: AlertStatus; page?: number; pageSize?: number }): Promise<Page<EmergencyAlertDTO>>;
  create(a: Omit<EmergencyAlertDTO, 'id' | 'createdAt'>): Promise<EmergencyAlertDTO>;
  acknowledge(campusId: string, id: string, byUserId: string, at: Date): Promise<EmergencyAlertDTO | null>;
  resolve(campusId: string, id: string, byUserId: string, at: Date): Promise<EmergencyAlertDTO | null>;
}
