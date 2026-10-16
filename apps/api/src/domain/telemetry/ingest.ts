import type { TrackingConfig } from '../../config/env';
import { DomainError, badRequest, conflict, forbidden, notFound, tooMany } from '../errors';
import { EventRateLimiter } from '../rateLimiter';
import type {
  BusRepository, LiveEmitter, Principal, SpeedSource, TelemetryRecord, TelemetryRepository,
  TripRepository, UserRepository, VehicleLocationRepository,
} from '../types';
import { haversineMeters } from './geo';
import { buildBatchSchema, buildEventSchema, reasonFromZod } from './validation';

export interface EventResult {
  eventId: string | null;
  status: 'accepted' | 'duplicate' | 'rejected';
  appliedToLive?: boolean;
  reason?: string;
}
export interface IngestResult { tripId: string; results: EventResult[] }

export interface IngestDeps {
  users: UserRepository; buses: BusRepository; trips: TripRepository;
  telemetry: TelemetryRepository; live: VehicleLocationRepository;
  emitter: LiveEmitter; config: TrackingConfig; now?: () => Date;
}

const LATE_SYNC_SKEW_MS = 5_000;

export class TelemetryIngestService {
  private limiter: EventRateLimiter;
  private now: () => Date;
  private batchSchema; private eventSchema;

  constructor(private d: IngestDeps) {
    this.now = d.now ?? (() => new Date());
    this.limiter = new EventRateLimiter(d.config.rateLimitEvents, d.config.rateLimitWindowMs, () => this.now().getTime());
    this.batchSchema = buildBatchSchema(d.config);
    this.eventSchema = buildEventSchema(d.config);
  }

  async ingest(principal: Principal, body: unknown): Promise<IngestResult> {
    const cfg = this.d.config;

    // 1. Authorization first: role, then account state. Nothing from the body is trusted for identity.
    if (principal.role !== 'DRIVER') throw forbidden('DRIVER_ROLE_REQUIRED');
    const user = await this.d.users.findById(principal.campusId, principal.userId);
    if (!user || user.role !== 'DRIVER' || user.status !== 'ACTIVE') throw forbidden('ACCOUNT_NOT_ACTIVE');

    // 2. Envelope validation (strict: forged top-level fields such as isSimulated are rejected).
    const parsed = this.batchSchema.safeParse(body);
    if (!parsed.success) throw badRequest('INVALID_REQUEST', reasonFromZod(parsed.error));
    const { tripId, events } = parsed.data;

    // 3. Rate limit by authenticated driver, counted in events (an offline batch costs its size).
    if (!this.limiter.tryConsume(principal.userId, events.length)) throw tooMany();

    // 4. Trip/vehicle authorization. Unknown trip and someone else's trip are indistinguishable (no id probing).
    const trip = await this.d.trips.findById(principal.campusId, tripId);
    if (!trip || trip.driverId !== principal.userId) throw notFound('TRIP_NOT_FOUND');
    const bus = await this.d.buses.findById(principal.campusId, trip.busId);
    if (!bus || bus.driverId !== principal.userId) throw forbidden('VEHICLE_ASSIGNMENT_REVOKED');

    const receivedAt = this.now();
    const isActive = trip.status === 'ACTIVE';
    if (!isActive) {
      const ended = trip.endedAt?.getTime() ?? 0;
      if (receivedAt.getTime() - ended > cfg.lateSyncWindowMs) throw conflict('TRIP_NOT_ACTIVE');
    }

    // 5. Process events oldest-first so derived speed and jump checks see the right predecessor.
    const prepared = events.map((raw, index) => {
      const r = this.eventSchema.safeParse(raw);
      return r.success
        ? { index, ok: true as const, ev: r.data, t: Date.parse(r.data.capturedAt) }
        : { index, ok: false as const, reason: reasonFromZod(r.error), eventId: safeEventId(raw) };
    });
    const order = [...prepared].sort((a, b) => (a.ok && b.ok ? a.t - b.t || a.index - b.index : a.index - b.index));
    const results: EventResult[] = new Array(events.length);

    for (const p of order) {
      if (!p.ok) { results[p.index] = { eventId: p.eventId, status: 'rejected', reason: p.reason }; continue; }
      const { ev } = p;
      const capturedAt = new Date(p.t);
      const reject = (reason: string): EventResult => ({ eventId: ev.eventId, status: 'rejected', reason });

      // Device clock is untrusted: bound it against the server clock and the trip window.
      if (p.t > receivedAt.getTime() + cfg.maxFutureSkewMs) { results[p.index] = reject('FUTURE_TIMESTAMP'); continue; }
      if (p.t < receivedAt.getTime() - cfg.maxEventAgeMs) { results[p.index] = reject('EVENT_TOO_OLD'); continue; }
      if (p.t < trip.startedAt.getTime() - LATE_SYNC_SKEW_MS) { results[p.index] = reject('BEFORE_TRIP_START'); continue; }
      if (!isActive && p.t > (trip.endedAt?.getTime() ?? 0) + LATE_SYNC_SKEW_MS) { results[p.index] = reject('AFTER_TRIP_END'); continue; }
      if (ev.lat === 0 && ev.lng === 0) { results[p.index] = reject('INVALID_COORDINATES'); continue; }

      const prev = await this.d.telemetry.findLatestBefore(trip.id, capturedAt);
      let speedMps: number | null = null;
      let speedSource: SpeedSource = 'unavailable';
      if (prev) {
        const dtS = (p.t - prev.capturedAt.getTime()) / 1000;
        const dist = haversineMeters(prev.location, { lat: ev.lat, lng: ev.lng });
        const implied = dtS > 0 ? dist / dtS : Infinity;
        if (dist > cfg.minJumpMetersForCheck && implied > cfg.maxPlausibleSpeedMps) { results[p.index] = reject('IMPLAUSIBLE_JUMP'); continue; }
        if (ev.speedMps === undefined && dtS >= 1 && dtS <= 120) { speedMps = Math.round(implied * 100) / 100; speedSource = 'derived'; }
      }
      if (ev.speedMps !== undefined) { speedMps = ev.speedMps; speedSource = 'device'; }

      const lateSync = !isActive;
      const fresh = receivedAt.getTime() - p.t <= cfg.liveMaxAgeMs;
      const accurate = ev.accuracyM === undefined || ev.accuracyM <= cfg.liveMaxAccuracyM;
      const liveEligible = isActive && fresh && accurate;

      const rec: TelemetryRecord = {
        campusId: principal.campusId, tripId: trip.id, busId: trip.busId, driverId: principal.userId, eventId: ev.eventId,
        location: { lat: ev.lat, lng: ev.lng }, accuracyM: ev.accuracyM ?? null, speedMps, speedSource,
        headingDeg: ev.headingDeg === undefined ? null : ev.headingDeg % 360, capturedAt, receivedAt,
        liveEligible, lateSync, mode: trip.mode,
      };
      if ((await this.d.telemetry.insertIdempotent(rec)) === 'duplicate') {
        results[p.index] = { eventId: ev.eventId, status: 'duplicate' };
        continue;
      }

      let applied = false;
      if (liveEligible) {
        applied = await this.d.live.applyIfNewer({
          campusId: rec.campusId, busId: rec.busId, tripId: rec.tripId, location: rec.location, accuracyM: rec.accuracyM,
          speedMps: rec.speedMps, speedSource: rec.speedSource, headingDeg: rec.headingDeg,
          capturedAt: rec.capturedAt, receivedAt: rec.receivedAt, mode: rec.mode,
        });
        if (applied) {
          this.d.emitter.emitLocation(rec.campusId, rec.busId, {
            busId: rec.busId, tripId: rec.tripId, lat: rec.location.lat, lng: rec.location.lng,
            accuracyM: rec.accuracyM, speedMps: rec.speedMps, speedSource: rec.speedSource, headingDeg: rec.headingDeg,
            capturedAt: rec.capturedAt.toISOString(), receivedAt: rec.receivedAt.toISOString(), mode: rec.mode, freshness: 'LIVE',
          });
        }
      }
      results[p.index] = { eventId: ev.eventId, status: 'accepted', appliedToLive: applied };
    }
    return { tripId: trip.id, results };
  }
}

function safeEventId(raw: unknown): string | null {
  const id = (raw as { eventId?: unknown } | null)?.eventId;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export { DomainError };
