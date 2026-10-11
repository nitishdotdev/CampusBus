import { DomainError } from '../../../domain/errors';
import type {
  BusDTO, BusRepository, TelemetryRecord, TelemetryRepository, TripDTO, TripRepository, UserDTO, UserRepository,
  VehicleLocationDTO, VehicleLocationRepository,
} from '../../../domain/types';
import type { Models } from '../models';
import { fromPoint, toPoint } from '../models/shared';
import { isDuplicateKey, isValidId, optStr, pageOpts, str } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class MongoUserRepository implements UserRepository {
  constructor(private m: Models) {}
  async findById(campusId: string, id: string): Promise<UserDTO | null> {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d: any = await this.m.User.findOne({ _id: id, campusId }).lean();
    return d && {
      id: str(d._id), campusId: str(d.campusId), role: d.role, status: d.status,
      assignedBusId: optStr(d.assignedBusId), assignedRouteId: optStr(d.assignedRouteId),
    };
  }
}

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
    const [docs, total] = await Promise.all([
      this.m.Bus.find({ campusId }).sort({ number: 1 }).skip(skip).limit(pageSize).lean(),
      this.m.Bus.countDocuments({ campusId }),
    ]);
    return { items: docs.map(toBus), total, page, pageSize };
  }
}

const toTrip = (d: any): TripDTO => ({
  id: str(d._id), campusId: str(d.campusId), busId: str(d.busId), driverId: str(d.driverId), routeId: str(d.routeId),
  status: d.status, mode: d.mode, startedAt: d.startedAt, endedAt: d.endedAt ?? null,
});

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
    } catch (e) {
      if (isDuplicateKey(e)) throw new DomainError(409, 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP');
      throw e;
    }
  }
  async end(campusId: string, id: string, endedAt: Date, status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const d = await this.m.Trip.findOneAndUpdate(
      { _id: id, campusId, status: 'ACTIVE' },
      { $set: { status, endedAt }, $unset: { activeBusKey: 1, activeDriverKey: 1 } },
      { returnDocument: 'after' },
    ).lean();
    return d ? toTrip(d) : null;
  }
  async list(campusId: string, opts: { driverId?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const filter: Record<string, unknown> = { campusId };
    if (opts.driverId) filter.driverId = opts.driverId;
    const [docs, total] = await Promise.all([
      this.m.Trip.find(filter).sort({ startedAt: -1 }).skip(skip).limit(pageSize).lean(),
      this.m.Trip.countDocuments(filter),
    ]);
    return { items: docs.map(toTrip), total, page, pageSize };
  }
}

const toLoc = (d: any): VehicleLocationDTO => ({
  campusId: str(d.campusId), busId: str(d.busId), tripId: str(d.tripId), location: fromPoint(d.location),
  accuracyM: d.accuracyM ?? null, speedMps: d.speedMps ?? null, speedSource: d.speedSource, headingDeg: d.headingDeg ?? null,
  capturedAt: d.capturedAt, receivedAt: d.receivedAt, mode: d.mode,
});

export class MongoVehicleLocationRepository implements VehicleLocationRepository {
  constructor(private m: Models) {}
  async applyIfNewer(loc: VehicleLocationDTO): Promise<boolean> {
    const doc = { ...loc, location: toPoint(loc.location) };
    const filter = { busId: loc.busId, capturedAt: { $lt: loc.capturedAt } };
    try {
      // Match only if the stored position is older. If nothing matches and a document exists, the upsert's insert
      // violates the unique busId index (newer position already stored). If none exists yet, it inserts.
      const r = await this.m.VehicleLocation.findOneAndUpdate(filter, { $set: doc }, { upsert: true, returnDocument: 'after' }).lean();
      return !!r;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Either a newer position exists (correct: not applied) or two first-writes raced; retry the conditional update once.
      const r = await this.m.VehicleLocation.findOneAndUpdate(filter, { $set: doc }, { returnDocument: 'after' }).lean();
      return !!r;
    }
  }
  async getByBus(campusId: string, busId: string) {
    if (!isValidId(busId) || !isValidId(campusId)) return null;
    const d = await this.m.VehicleLocation.findOne({ campusId, busId }).lean();
    return d ? toLoc(d) : null;
  }
}

const toTel = (d: any): TelemetryRecord => ({
  campusId: str(d.campusId), tripId: str(d.tripId), busId: str(d.busId), driverId: str(d.driverId), eventId: d.eventId,
  location: fromPoint(d.location), accuracyM: d.accuracyM ?? null, speedMps: d.speedMps ?? null, speedSource: d.speedSource,
  headingDeg: d.headingDeg ?? null, capturedAt: d.capturedAt, receivedAt: d.receivedAt,
  liveEligible: d.liveEligible, lateSync: d.lateSync, mode: d.mode,
});

export class MongoTelemetryRepository implements TelemetryRepository {
  constructor(private m: Models) {}
  async insertIdempotent(rec: TelemetryRecord) {
    try {
      await this.m.Telemetry.create({ ...rec, location: toPoint(rec.location) });
      return 'inserted' as const;
    } catch (e) {
      if (isDuplicateKey(e)) return 'duplicate' as const;
      throw e;
    }
  }
  async findLatestBefore(tripId: string, before: Date) {
    const d = await this.m.Telemetry.findOne({ tripId, capturedAt: { $lt: before } }).sort({ capturedAt: -1 }).lean();
    return d ? toTel(d) : null;
  }
  async listByTrip(tripId: string, opts: { page?: number; pageSize?: number }) {
    const { pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([
      this.m.Telemetry.find({ tripId }).sort({ capturedAt: 1 }).skip(skip).limit(pageSize).lean(),
      this.m.Telemetry.countDocuments({ tripId }),
    ]);
    return { items: docs.map(toTel), total };
  }
  async purgeReceivedBefore(cutoff: Date) {
    const r = await this.m.Telemetry.deleteMany({ receivedAt: { $lt: cutoff } });
    return r.deletedCount ?? 0;
  }
}

export function createRepositories(m: Models) {
  return {
    users: new MongoUserRepository(m), buses: new MongoBusRepository(m), trips: new MongoTripRepository(m),
    live: new MongoVehicleLocationRepository(m), telemetry: new MongoTelemetryRepository(m),
  };
}
