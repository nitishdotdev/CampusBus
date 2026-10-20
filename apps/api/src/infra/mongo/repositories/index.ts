import crypto from 'crypto';
import mongoose from 'mongoose';
import { DomainError } from '../../../domain/errors';
import type {
  AlertStatus, BusDTO, BusRepository, CampusDTO, CampusRepository, EmailSender, EmailTokenRepository,
  EmergencyAlertDTO, EmergencyAlertRepository, NotificationDTO, NotificationRepository,
  Page, RefreshTokenRepository, RouteDTO, RouteRepository, ScheduleDTO, ScheduleRepository,
  StopDTO, TelemetryRecord, TelemetryRepository, TripDTO, TripRepository, UserDTO, UserRepository,
  VehicleLocationDTO, VehicleLocationRepository,
} from '../../../domain/types';
import type { Models } from '../models';
import { fromPoint, toPoint } from '../models/shared';
import { isDuplicateKey, isValidId, optStr, pageOpts, str } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Helpers ────────────────────────────────────────────────────────────────
const toUser = (d: any): UserDTO => ({
  id: str(d._id), campusId: str(d.campusId), email: d.email, name: d.name,
  role: d.role, status: d.status, emailVerifiedAt: d.emailVerifiedAt ?? null,
  assignedBusId: optStr(d.assignedBusId), assignedRouteId: optStr(d.assignedRouteId),
});

// ─── UserRepository ─────────────────────────────────────────────────────────
export class MongoUserRepository implements UserRepository {
  constructor(private m: Models) {}

  async findById(campusId: string, id: string): Promise<UserDTO | null> {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.User.findOne({ _id: id, campusId }).lean();
    return d ? toUser(d) : null;
  }
  async findByEmail(campusId: string, email: string): Promise<(UserDTO & { passwordHash: string }) | null> {
    if (!isValidId(campusId)) return null;
    const d: any = await this.m.User.findOne({ campusId, email: email.toLowerCase() }).select('+passwordHash').lean();
    return d ? { ...toUser(d), passwordHash: d.passwordHash } : null;
  }
  async create(u: Parameters<UserRepository['create']>[0]): Promise<UserDTO> {
    try {
      const d = await this.m.User.create({ ...u, email: u.email.toLowerCase() });
      return toUser(d.toObject());
    } catch (e) {
      if (isDuplicateKey(e)) throw new DomainError(409, 'EMAIL_ALREADY_REGISTERED');
      throw e;
    }
  }
  async updateStatus(campusId: string, id: string, status: UserDTO['status']): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.m.User.updateOne({ _id: id, campusId }, { status });
    return r.modifiedCount > 0;
  }
  async verifyEmail(campusId: string, id: string, at: Date): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.m.User.updateOne({ _id: id, campusId, emailVerifiedAt: null }, { emailVerifiedAt: at });
    return r.modifiedCount > 0;
  }
  async updatePassword(campusId: string, id: string, hash: string): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.m.User.updateOne({ _id: id, campusId }, { passwordHash: hash });
    return r.modifiedCount > 0;
  }
  async list(campusId: string, opts: Parameters<UserRepository['list']>[1]): Promise<Page<UserDTO>> {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.role) filter.role = opts.role;
    if (opts.status) filter.status = opts.status;
    const [docs, total] = await Promise.all([
      this.m.User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
      this.m.User.countDocuments(filter),
    ]);
    return { items: (docs as any[]).map(toUser), total, page, pageSize };
  }
  async assignTransport(campusId: string, id: string, busId: string | null, routeId: string | null): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const upd: Record<string, unknown> = {};
    busId ? (upd.assignedBusId = new mongoose.Types.ObjectId(busId)) : (upd.assignedBusId = null);
    routeId ? (upd.assignedRouteId = new mongoose.Types.ObjectId(routeId)) : (upd.assignedRouteId = null);
    const r = await this.m.User.updateOne({ _id: id, campusId }, { $set: upd });
    return r.modifiedCount > 0;
  }
}

// ─── RefreshTokenRepository ──────────────────────────────────────────────────
export class MongoRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private m: Models) {}
  async create(t: Parameters<RefreshTokenRepository['create']>[0]): Promise<string> {
    const d = await (this.m as any).RefreshToken.create(t);
    return str(d._id);
  }
  async find(tokenHash: string) {
    const d: any = await (this.m as any).RefreshToken.findOne({ tokenHash }).lean();
    if (!d) return null;
    return { id: str(d._id), userId: str(d.userId), campusId: str(d.campusId), familyId: d.familyId, expiresAt: d.expiresAt, revokedAt: d.revokedAt ?? null, previousId: d.previousId ?? null };
  }
  async revoke(id: string, at: Date) { await (this.m as any).RefreshToken.updateOne({ _id: id }, { revokedAt: at }); }
  async revokeFamily(familyId: string, at: Date) { await (this.m as any).RefreshToken.updateMany({ familyId, revokedAt: null }, { revokedAt: at }); }
  async revokeAll(userId: string, at: Date) { await (this.m as any).RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: at }); }
  async purgeExpired(cutoff: Date): Promise<number> { const r = await (this.m as any).RefreshToken.deleteMany({ expiresAt: { $lt: cutoff } }); return r.deletedCount ?? 0; }
}

// ─── EmailTokenRepository ────────────────────────────────────────────────────
export class MongoEmailTokenRepository implements EmailTokenRepository {
  constructor(private m: Models) {}
  async upsert(t: Parameters<EmailTokenRepository['upsert']>[0]) {
    await (this.m as any).EmailToken.findOneAndUpdate({ userId: t.userId, purpose: t.purpose }, { $set: t }, { upsert: true });
  }
  async find(tokenHash: string, purpose: string) {
    const d: any = await (this.m as any).EmailToken.findOne({ tokenHash, purpose }).lean();
    if (!d) return null;
    return { userId: str(d.userId), campusId: str(d.campusId), expiresAt: d.expiresAt, usedAt: d.usedAt ?? null };
  }
  async markUsed(tokenHash: string, at: Date) { await (this.m as any).EmailToken.updateOne({ tokenHash }, { usedAt: at }); }
}

// ─── BusRepository ───────────────────────────────────────────────────────────
const toBus = (d: any): BusDTO => ({
  id: str(d._id), campusId: str(d.campusId), number: d.number, capacity: d.capacity, status: d.status,
  driverId: optStr(d.driverId), routeId: optStr(d.routeId),
});
export class MongoBusRepository implements BusRepository {
  constructor(private m: Models) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Bus.findOne({ _id: id, campusId }).lean();
    return d ? toBus(d) : null;
  }
  async list(campusId: string, opts: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([this.m.Bus.find({ campusId }).sort({ number: 1 }).skip(skip).limit(pageSize).lean(), this.m.Bus.countDocuments({ campusId })]);
    return { items: (docs as any[]).map(toBus), total, page, pageSize };
  }
  async create(b: Omit<BusDTO, 'id'>): Promise<BusDTO> {
    try { const d = await this.m.Bus.create(b); return toBus(d.toObject()); }
    catch (e) { if (isDuplicateKey(e)) throw new DomainError(409, 'BUS_NUMBER_TAKEN'); throw e; }
  }
  async update(campusId: string, id: string, patch: Partial<Omit<BusDTO, 'id' | 'campusId'>>): Promise<BusDTO | null> {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Bus.findOneAndUpdate({ _id: id, campusId }, { $set: patch }, { returnDocument: 'after' }).lean();
    return d ? toBus(d) : null;
  }
  async delete(campusId: string, id: string): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.m.Bus.deleteOne({ _id: id, campusId });
    return r.deletedCount > 0;
  }
  async assignDriver(campusId: string, id: string, driverId: string | null): Promise<BusDTO | null> {
    const upd = driverId ? { $set: { driverId } } : { $unset: { driverId: 1 } };
    try {
      const d = await this.m.Bus.findOneAndUpdate({ _id: id, campusId }, upd, { returnDocument: 'after' }).lean();
      return d ? toBus(d) : null;
    } catch (e) { if (isDuplicateKey(e)) throw new DomainError(409, 'DRIVER_ALREADY_ASSIGNED'); throw e; }
  }
  async assignRoute(campusId: string, id: string, routeId: string | null): Promise<BusDTO | null> {
    const upd = routeId ? { $set: { routeId } } : { $unset: { routeId: 1 } };
    const d = await this.m.Bus.findOneAndUpdate({ _id: id, campusId }, upd, { returnDocument: 'after' }).lean();
    return d ? toBus(d) : null;
  }
}

// ─── RouteRepository ─────────────────────────────────────────────────────────
const toStop = (s: any): StopDTO => ({ id: str(s._id), name: s.name, lat: s.location.coordinates[1], lng: s.location.coordinates[0], order: s.order });
const toRoute = (d: any): RouteDTO => ({ id: str(d._id), campusId: str(d.campusId), code: d.code, name: d.name, color: d.color, stops: (d.stops || []).map(toStop).sort((a: StopDTO, b: StopDTO) => a.order - b.order) });
export class MongoRouteRepository implements RouteRepository {
  constructor(private m: Models) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Route.findOne({ _id: id, campusId }).lean();
    return d ? toRoute(d) : null;
  }
  async list(campusId: string, opts: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([this.m.Route.find({ campusId }).sort({ code: 1 }).skip(skip).limit(pageSize).lean(), this.m.Route.countDocuments({ campusId })]);
    return { items: (docs as any[]).map(toRoute), total, page, pageSize };
  }
  async create(r: Omit<RouteDTO, 'id'>): Promise<RouteDTO> {
    try {
      const stops = r.stops.map(s => ({ name: s.name, order: s.order, location: { type: 'Point', coordinates: [s.lng, s.lat] } }));
      const d = await this.m.Route.create({ campusId: r.campusId, code: r.code, name: r.name, color: r.color, stops });
      return toRoute(d.toObject());
    } catch (e) { if (isDuplicateKey(e)) throw new DomainError(409, 'ROUTE_CODE_TAKEN'); throw e; }
  }
  async update(campusId: string, id: string, patch: Partial<Omit<RouteDTO, 'id' | 'campusId'>>): Promise<RouteDTO | null> {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const upd: Record<string, unknown> = {};
    if (patch.name) upd.name = patch.name;
    if (patch.color) upd.color = patch.color;
    if (patch.stops) upd.stops = patch.stops.map(s => ({ name: s.name, order: s.order, location: { type: 'Point', coordinates: [s.lng, s.lat] } }));
    const d = await this.m.Route.findOneAndUpdate({ _id: id, campusId }, { $set: upd }, { returnDocument: 'after' }).lean();
    return d ? toRoute(d) : null;
  }
  async delete(campusId: string, id: string): Promise<boolean> {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.m.Route.deleteOne({ _id: id, campusId });
    return r.deletedCount > 0;
  }
}

// ─── TripRepository ──────────────────────────────────────────────────────────
const toTrip = (d: any): TripDTO => ({ id: str(d._id), campusId: str(d.campusId), busId: str(d.busId), driverId: str(d.driverId), routeId: str(d.routeId), status: d.status, mode: d.mode, startedAt: d.startedAt, endedAt: d.endedAt ?? null });
export class MongoTripRepository implements TripRepository {
  constructor(private m: Models) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Trip.findOne({ _id: id, campusId }).lean();
    return d ? toTrip(d) : null;
  }
  async findActiveByBus(campusId: string, busId: string) {
    if (!isValidId(busId) || !isValidId(campusId)) return null;
    const d = await this.m.Trip.findOne({ campusId, busId, status: 'ACTIVE' }).lean();
    return d ? toTrip(d) : null;
  }
  async start(t: Parameters<TripRepository['start']>[0]) {
    try {
      const d = await this.m.Trip.create({ ...t, status: 'ACTIVE', activeBusKey: t.busId, activeDriverKey: t.driverId });
      return toTrip(d.toObject());
    } catch (e) { if (isDuplicateKey(e)) throw new DomainError(409, 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP'); throw e; }
  }
  async end(campusId: string, id: string, endedAt: Date, status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Trip.findOneAndUpdate({ _id: id, campusId, status: 'ACTIVE' }, { $set: { status, endedAt }, $unset: { activeBusKey: 1, activeDriverKey: 1 } }, { returnDocument: 'after' }).lean();
    return d ? toTrip(d) : null;
  }
  async list(campusId: string, opts: Parameters<TripRepository['list']>[1]) {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.driverId) filter.driverId = opts.driverId;
    if (opts.busId) filter.busId = opts.busId;
    if (opts.status) filter.status = opts.status;
    const [docs, total] = await Promise.all([this.m.Trip.find(filter).sort({ startedAt: -1 }).skip(skip).limit(pageSize).lean(), this.m.Trip.countDocuments(filter)]);
    return { items: (docs as any[]).map(toTrip), total, page, pageSize };
  }
}

// ─── VehicleLocationRepository ───────────────────────────────────────────────
const toLoc = (d: any): VehicleLocationDTO => ({ campusId: str(d.campusId), busId: str(d.busId), tripId: str(d.tripId), location: fromPoint(d.location), accuracyM: d.accuracyM ?? null, speedMps: d.speedMps ?? null, speedSource: d.speedSource, headingDeg: d.headingDeg ?? null, capturedAt: d.capturedAt, receivedAt: d.receivedAt, mode: d.mode });
export class MongoVehicleLocationRepository implements VehicleLocationRepository {
  constructor(private m: Models) {}
  async applyIfNewer(loc: VehicleLocationDTO): Promise<boolean> {
    const doc = { ...loc, location: toPoint(loc.location) };
    const filter = { busId: loc.busId, capturedAt: { $lt: loc.capturedAt } };
    try {
      const r = await this.m.VehicleLocation.findOneAndUpdate(filter, { $set: doc }, { upsert: true, returnDocument: 'after' }).lean();
      return !!r;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      const r = await this.m.VehicleLocation.findOneAndUpdate(filter, { $set: doc }, { returnDocument: 'after' }).lean();
      return !!r;
    }
  }
  async getByBus(campusId: string, busId: string) {
    if (!isValidId(busId) || !isValidId(campusId)) return null;
    const d = await this.m.VehicleLocation.findOne({ campusId, busId }).lean();
    return d ? toLoc(d) : null;
  }
  async listByCampus(campusId: string): Promise<VehicleLocationDTO[]> {
    if (!isValidId(campusId)) return [];
    const docs = await this.m.VehicleLocation.find({ campusId }).lean();
    return (docs as any[]).map(toLoc);
  }
}

// ─── TelemetryRepository ─────────────────────────────────────────────────────
const toTel = (d: any): TelemetryRecord => ({ campusId: str(d.campusId), tripId: str(d.tripId), busId: str(d.busId), driverId: str(d.driverId), eventId: d.eventId, location: fromPoint(d.location), accuracyM: d.accuracyM ?? null, speedMps: d.speedMps ?? null, speedSource: d.speedSource, headingDeg: d.headingDeg ?? null, capturedAt: d.capturedAt, receivedAt: d.receivedAt, liveEligible: d.liveEligible, lateSync: d.lateSync, mode: d.mode });
export class MongoTelemetryRepository implements TelemetryRepository {
  constructor(private m: Models) {}
  async insertIdempotent(rec: TelemetryRecord) {
    try { await this.m.Telemetry.create({ ...rec, location: toPoint(rec.location) }); return 'inserted' as const; }
    catch (e) { if (isDuplicateKey(e)) return 'duplicate' as const; throw e; }
  }
  async findLatestBefore(tripId: string, before: Date) {
    const d = await this.m.Telemetry.findOne({ tripId, capturedAt: { $lt: before } }).sort({ capturedAt: -1 }).lean();
    return d ? toTel(d) : null;
  }
  async listByTrip(tripId: string, opts: { page?: number; pageSize?: number }) {
    const { pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([this.m.Telemetry.find({ tripId }).sort({ capturedAt: 1 }).skip(skip).limit(pageSize).lean(), this.m.Telemetry.countDocuments({ tripId })]);
    return { items: (docs as any[]).map(toTel), total };
  }
  async purgeReceivedBefore(cutoff: Date) {
    const r = await this.m.Telemetry.deleteMany({ receivedAt: { $lt: cutoff } });
    return r.deletedCount ?? 0;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────
export function createRepositories(m: Models) {
  return {
    campuses: new MongoCampusRepository(m),
    users: new MongoUserRepository(m),
    schedules: new MongoScheduleRepository(m),
    notifications: new MongoNotificationRepository(m),
    alerts: new MongoEmergencyAlertRepository(m),
    refreshTokens: new MongoRefreshTokenRepository(m),
    emailTokens: new MongoEmailTokenRepository(m),
    buses: new MongoBusRepository(m),
    routes: new MongoRouteRepository(m),
    trips: new MongoTripRepository(m),
    live: new MongoVehicleLocationRepository(m),
    telemetry: new MongoTelemetryRepository(m),
  };
}

// ─── ScheduleRepository ───────────────────────────────────────────────────────
const toSched = (d: any): import('../../../domain/types').ScheduleDTO => ({
  id: str(d._id), campusId: str(d.campusId), routeId: str(d.routeId), busId: str(d.busId),
  direction: d.direction, daysOfWeek: d.daysOfWeek, departTime: d.departTime, active: d.active ?? true,
});
export class MongoScheduleRepository implements ScheduleRepository {
  constructor(private m: Models) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Schedule.findOne({ _id: id, campusId }).lean();
    return d ? toSched(d) : null;
  }
  async list(campusId: string, opts: { routeId?: string; day?: number; active?: boolean; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.routeId) filter.routeId = opts.routeId;
    if (opts.day !== undefined) filter.daysOfWeek = opts.day;
    if (opts.active !== undefined) filter.active = opts.active;
    const [docs, total] = await Promise.all([this.m.Schedule.find(filter).sort({ departTime: 1 }).skip(skip).limit(pageSize).lean(), this.m.Schedule.countDocuments(filter)]);
    return { items: (docs as any[]).map(toSched), total, page, pageSize };
  }
  async create(s: Omit<ScheduleDTO, 'id'>) {
    const d = await this.m.Schedule.create(s);
    return toSched(d.toObject());
  }
  async update(campusId: string, id: string, patch: Partial<Omit<ScheduleDTO, 'id' | 'campusId'>>) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Schedule.findOneAndUpdate({ _id: id, campusId }, { $set: patch }, { returnDocument: 'after' }).lean();
    return d ? toSched(d) : null;
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    return (await this.m.Schedule.deleteOne({ _id: id, campusId })).deletedCount > 0;
  }
}

// ─── NotificationRepository ──────────────────────────────────────────────────
const toNotif = (d: any): import('../../../domain/types').NotificationDTO => ({
  id: str(d._id), campusId: str(d.campusId), kind: d.kind, priority: d.priority,
  title: d.title, body: d.body, routeId: optStr(d.routeId), createdBy: str(d.createdBy),
  expiresAt: d.expiresAt ?? null, createdAt: d.createdAt,
});
export class MongoNotificationRepository implements NotificationRepository {
  constructor(private m: Models) {}
  async list(campusId: string, opts: { routeId?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.routeId) filter.routeId = opts.routeId;
    const [docs, total] = await Promise.all([this.m.Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), this.m.Notification.countDocuments(filter)]);
    return { items: (docs as any[]).map(toNotif), total, page, pageSize };
  }
  async create(n: Omit<NotificationDTO, 'id' | 'createdAt'>) {
    const d = await this.m.Notification.create(n);
    return toNotif(d.toObject());
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    return (await this.m.Notification.deleteOne({ _id: id, campusId })).deletedCount > 0;
  }
}

// ─── EmergencyAlertRepository ─────────────────────────────────────────────────
const fromGeo = (g: any) => g ? { lat: g.coordinates[1], lng: g.coordinates[0] } : null;
const toAlert = (d: any): import('../../../domain/types').EmergencyAlertDTO => ({
  id: str(d._id), campusId: str(d.campusId), busId: str(d.busId), tripId: optStr(d.tripId),
  raisedBy: str(d.raisedBy), status: d.status, message: d.message ?? null,
  location: fromGeo(d.location), createdAt: d.createdAt,
  acknowledgedBy: optStr(d.acknowledgedBy), acknowledgedAt: d.acknowledgedAt ?? null,
  resolvedBy: optStr(d.resolvedBy), resolvedAt: d.resolvedAt ?? null,
});
export class MongoEmergencyAlertRepository implements EmergencyAlertRepository {
  constructor(private m: Models) {}
  async list(campusId: string, opts: { status?: AlertStatus; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.status) filter.status = opts.status;
    const [docs, total] = await Promise.all([this.m.EmergencyAlert.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), this.m.EmergencyAlert.countDocuments(filter)]);
    return { items: (docs as any[]).map(toAlert), total, page, pageSize };
  }
  async create(a: Omit<EmergencyAlertDTO, 'id' | 'createdAt'>) {
    const doc: any = { ...a };
    if (a.location) doc.location = { type: 'Point', coordinates: [a.location.lng, a.location.lat] };
    const d = await this.m.EmergencyAlert.create(doc);
    return toAlert(d.toObject());
  }
  async acknowledge(campusId: string, id: string, byUserId: string, at: Date) {
    if (!isValidId(id)) return null;
    const d = await this.m.EmergencyAlert.findOneAndUpdate({ _id: id, campusId, status: 'OPEN' }, { $set: { status: 'ACKNOWLEDGED', acknowledgedBy: byUserId, acknowledgedAt: at } }, { returnDocument: 'after' }).lean();
    return d ? toAlert(d) : null;
  }
  async resolve(campusId: string, id: string, byUserId: string, at: Date) {
    if (!isValidId(id)) return null;
    const d = await this.m.EmergencyAlert.findOneAndUpdate({ _id: id, campusId, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } }, { $set: { status: 'RESOLVED', resolvedBy: byUserId, resolvedAt: at } }, { returnDocument: 'after' }).lean();
    return d ? toAlert(d) : null;
  }
}

// ─── CampusRepository ─────────────────────────────────────────────────────────
const toCampus = (d: any): CampusDTO => ({
  id: str(d._id), name: d.name, shortCode: d.shortCode, city: d.city ?? '',
  lat: d.lat, lng: d.lng, zoom: d.zoom ?? 15, timezone: d.timezone ?? 'UTC',
});
export class MongoCampusRepository implements CampusRepository {
  constructor(private m: Models) {}
  async list(): Promise<CampusDTO[]> {
    const docs = await this.m.Campus.find({}).sort({ name: 1 }).lean();
    return docs.map(toCampus);
  }
  async findById(id: string): Promise<CampusDTO | null> {
    if (!isValidId(id)) return null;
    const d = await this.m.Campus.findById(id).lean();
    return d ? toCampus(d) : null;
  }
  async findByCode(shortCode: string): Promise<CampusDTO | null> {
    const d = await this.m.Campus.findOne({ shortCode: shortCode.toUpperCase() }).lean();
    return d ? toCampus(d) : null;
  }
  async create(c: Omit<CampusDTO, 'id'>): Promise<CampusDTO> {
    const d = await this.m.Campus.create({ ...c, shortCode: c.shortCode.toUpperCase() });
    return toCampus(d.toObject());
  }
}
