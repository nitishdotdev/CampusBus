import { forbidden, notFound } from './errors';
import { canViewBus } from './access';
import { computeFreshness, type Freshness } from './telemetry/freshness';
import type { BusRepository, Principal, TripRepository, UserRepository, VehicleLocationRepository } from './types';

export interface LiveSnapshot {
  busId: string; freshness: Freshness; ageMs: number | null; tripId: string | null;
  position: null | { lat: number; lng: number; accuracyM: number | null; speedMps: number | null; speedSource: string; headingDeg: number | null; capturedAt: string; receivedAt: string; mode: string };
}

export class LiveService {
  constructor(private d: { users: UserRepository; buses: BusRepository; trips: TripRepository; live: VehicleLocationRepository; now?: () => Date }) {}

  /** Throws unless the principal may observe this bus. Used by REST snapshots AND socket subscriptions. */
  async authorize(p: Principal, busId: string) {
    if (!/^[a-f0-9]{24}$/i.test(busId)) throw notFound('BUS_NOT_FOUND');
    const [user, bus] = await Promise.all([this.d.users.findById(p.campusId, p.userId), this.d.buses.findById(p.campusId, busId)]);
    if (!user || !bus) throw notFound('BUS_NOT_FOUND');
    if (!canViewBus(p, user, bus)) throw forbidden('NOT_AUTHORIZED_FOR_BUS');
    return bus;
  }

  async snapshot(p: Principal, busId: string): Promise<LiveSnapshot> {
    await this.authorize(p, busId);
    const [loc, active] = await Promise.all([this.d.live.getByBus(p.campusId, busId), this.d.trips.findActiveByBus(p.campusId, busId)]);
    const { state, ageMs } = computeFreshness((this.d.now ?? (() => new Date()))(), loc, active);
    return {
      busId, freshness: state, ageMs, tripId: active?.id ?? null,
      position: loc ? {
        lat: loc.location.lat, lng: loc.location.lng, accuracyM: loc.accuracyM, speedMps: loc.speedMps, speedSource: loc.speedSource,
        headingDeg: loc.headingDeg, capturedAt: loc.capturedAt.toISOString(), receivedAt: loc.receivedAt.toISOString(), mode: loc.mode,
      } : null,
    };
  }
}
