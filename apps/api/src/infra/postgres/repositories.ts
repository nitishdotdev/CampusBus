import type pg from 'pg';
import { DomainError } from '../../domain/errors';
import type {
  AlertStatus, BusDTO, BusRepository, CampusDTO, CampusRepository,
  EmailTokenRepository, EmergencyAlertDTO, EmergencyAlertRepository,
  NotificationDTO, NotificationRepository, RefreshTokenRepository,
  RouteDTO, RouteRepository, ScheduleDTO, ScheduleRepository, StopDTO,
  TelemetryRecord, TelemetryRepository, TripDTO, TripRepository,
  UserDTO, UserRepository, VehicleLocationDTO, VehicleLocationRepository,
} from '../../domain/types';
import { isUniqueViolation, isValidId, newId } from './ids';

function pageOpts(o: { page?: number; pageSize?: number }) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(o.pageSize ?? 25)));
  const page = Math.max(1, Math.floor(o.page ?? 1));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

const toUser = (d: any): UserDTO => ({
  id: d.id, campusId: d.campus_id, email: d.email, name: d.name,
  role: d.role, status: d.status, emailVerifiedAt: d.email_verified_at ?? null,
  assignedBusId: d.assigned_bus_id ?? null, assignedRouteId: d.assigned_route_id ?? null,
  phone: d.phone ?? null,
});

export class PgUserRepository implements UserRepository {
  constructor(private p: pg.Pool) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.users WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }
  async findByEmail(campusId: string, email: string) {
    if (!isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.users WHERE campus_id = $1 AND email = $2', [campusId, email.toLowerCase()]);
    return r.rows[0] ? { ...toUser(r.rows[0]), passwordHash: r.rows[0].password_hash } : null;
  }
  async create(u: Parameters<UserRepository['create']>[0]) {
    try {
      const r = await this.p.query(
        `INSERT INTO v1.users (id, campus_id, email, password_hash, name, role, status, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [newId(), u.campusId, u.email.toLowerCase(), u.passwordHash, u.name, u.role, u.status, u.phone ?? null],
      );
      return toUser(r.rows[0]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError(409, 'EMAIL_ALREADY_REGISTERED');
      throw e;
    }
  }
  async updateStatus(campusId: string, id: string, status: UserDTO['status']) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query(
      'UPDATE v1.users SET status = $3, updated_at = NOW() WHERE id = $1 AND campus_id = $2',
      [id, campusId, status],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async verifyEmail(campusId: string, id: string, at: Date) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query(
      'UPDATE v1.users SET email_verified_at = $3, updated_at = NOW() WHERE id = $1 AND campus_id = $2 AND email_verified_at IS NULL',
      [id, campusId, at],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async updatePassword(campusId: string, id: string, hash: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query(
      'UPDATE v1.users SET password_hash = $3, updated_at = NOW() WHERE id = $1 AND campus_id = $2',
      [id, campusId, hash],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async list(campusId: string, opts: Parameters<UserRepository['list']>[1]) {
    const { page, pageSize, skip } = pageOpts(opts);
    const params: unknown[] = [campusId];
    let where = 'campus_id = $1';
    if (opts.role) { params.push(opts.role); where += ` AND role = $${params.length}`; }
    if (opts.status) { params.push(opts.status); where += ` AND status = $${params.length}`; }
    const [docs, total] = await Promise.all([
      this.p.query(`SELECT * FROM v1.users WHERE ${where} ORDER BY created_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`, [...params, skip, pageSize]),
      this.p.query(`SELECT COUNT(*)::int AS n FROM v1.users WHERE ${where}`, params),
    ]);
    return { items: docs.rows.map(toUser), total: total.rows[0].n, page, pageSize };
  }
  async assignTransport(campusId: string, id: string, busId: string | null, routeId: string | null) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query(
      'UPDATE v1.users SET assigned_bus_id = $3, assigned_route_id = $4, updated_at = NOW() WHERE id = $1 AND campus_id = $2',
      [id, campusId, busId, routeId],
    );
    return (r.rowCount ?? 0) > 0;
  }
}

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private p: pg.Pool) {}
  async create(t: Parameters<RefreshTokenRepository['create']>[0]) {
    const id = newId();
    await this.p.query(
      `INSERT INTO v1.refresh_tokens (id, user_id, campus_id, token_hash, family_id, previous_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, t.userId, t.campusId, t.tokenHash, t.familyId, t.previousId ?? null, t.expiresAt],
    );
    return id;
  }
  async find(tokenHash: string) {
    const r = await this.p.query('SELECT * FROM v1.refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const d = r.rows[0];
    if (!d) return null;
    return { id: d.id, userId: d.user_id, campusId: d.campus_id, familyId: d.family_id, expiresAt: d.expires_at, revokedAt: d.revoked_at ?? null, previousId: d.previous_id ?? null };
  }
  async revoke(id: string, at: Date) {
    await this.p.query('UPDATE v1.refresh_tokens SET revoked_at = $2 WHERE id = $1', [id, at]);
  }
  async revokeFamily(familyId: string, at: Date) {
    await this.p.query('UPDATE v1.refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL', [familyId, at]);
  }
  async revokeAll(userId: string, at: Date) {
    await this.p.query('UPDATE v1.refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, at]);
  }
  async purgeExpired(cutoff: Date) {
    const r = await this.p.query('DELETE FROM v1.refresh_tokens WHERE expires_at < $1', [cutoff]);
    return r.rowCount ?? 0;
  }
}

export class PgEmailTokenRepository implements EmailTokenRepository {
  constructor(private p: pg.Pool) {}
  async upsert(t: Parameters<EmailTokenRepository['upsert']>[0]) {
    await this.p.query(
      `INSERT INTO v1.email_tokens (user_id, campus_id, purpose, token_hash, expires_at, used_at)
       VALUES ($1,$2,$3,$4,$5,NULL)
       ON CONFLICT (user_id, purpose) DO UPDATE SET campus_id = EXCLUDED.campus_id, token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, used_at = NULL`,
      [t.userId, t.campusId, t.purpose, t.tokenHash, t.expiresAt],
    );
  }
  async find(tokenHash: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const r = await this.p.query('SELECT * FROM v1.email_tokens WHERE token_hash = $1 AND purpose = $2', [tokenHash, purpose]);
    const d = r.rows[0];
    if (!d) return null;
    return { userId: d.user_id, campusId: d.campus_id, expiresAt: d.expires_at, usedAt: d.used_at ?? null };
  }
  async markUsed(tokenHash: string, at: Date) {
    await this.p.query('UPDATE v1.email_tokens SET used_at = $2 WHERE token_hash = $1', [tokenHash, at]);
  }
}

const toBus = (d: any): BusDTO => ({
  id: d.id, campusId: d.campus_id, number: d.number, capacity: d.capacity, status: d.status,
  driverId: d.driver_id ?? null, routeId: d.route_id ?? null,
});

export class PgBusRepository implements BusRepository {
  constructor(private p: pg.Pool) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.buses WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return r.rows[0] ? toBus(r.rows[0]) : null;
  }
  async list(campusId: string, opts: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([
      this.p.query('SELECT * FROM v1.buses WHERE campus_id = $1 ORDER BY number ASC OFFSET $2 LIMIT $3', [campusId, skip, pageSize]),
      this.p.query('SELECT COUNT(*)::int AS n FROM v1.buses WHERE campus_id = $1', [campusId]),
    ]);
    return { items: docs.rows.map(toBus), total: total.rows[0].n, page, pageSize };
  }
  async create(b: Omit<BusDTO, 'id'>) {
    try {
      const r = await this.p.query(
        `INSERT INTO v1.buses (id, campus_id, number, capacity, status, driver_id, route_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [newId(), b.campusId, b.number, b.capacity, b.status, b.driverId ?? null, b.routeId ?? null],
      );
      return toBus(r.rows[0]);
    } catch (e) {
      if (isUniqueViolation(e, 'buses_campus_number_key')) throw new DomainError(409, 'BUS_NUMBER_TAKEN');
      throw e;
    }
  }
  async update(campusId: string, id: string, patch: Partial<Omit<BusDTO, 'id' | 'campusId'>>) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const sets: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (patch.number !== undefined) add('number', patch.number);
    if (patch.capacity !== undefined) add('capacity', patch.capacity);
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.driverId !== undefined) add('driver_id', patch.driverId);
    if (patch.routeId !== undefined) add('route_id', patch.routeId);
    vals.push(id, campusId);
    const r = await this.p.query(
      `UPDATE v1.buses SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND campus_id = $${vals.length} RETURNING *`,
      vals,
    );
    return r.rows[0] ? toBus(r.rows[0]) : null;
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query('DELETE FROM v1.buses WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return (r.rowCount ?? 0) > 0;
  }
  async assignDriver(campusId: string, id: string, driverId: string | null) {
    try {
      const r = await this.p.query(
        'UPDATE v1.buses SET driver_id = $3, updated_at = NOW() WHERE id = $1 AND campus_id = $2 RETURNING *',
        [id, campusId, driverId],
      );
      return r.rows[0] ? toBus(r.rows[0]) : null;
    } catch (e) {
      if (isUniqueViolation(e, 'buses_driver_unique')) throw new DomainError(409, 'DRIVER_ALREADY_ASSIGNED');
      throw e;
    }
  }
  async assignRoute(campusId: string, id: string, routeId: string | null) {
    const r = await this.p.query(
      'UPDATE v1.buses SET route_id = $3, updated_at = NOW() WHERE id = $1 AND campus_id = $2 RETURNING *',
      [id, campusId, routeId],
    );
    return r.rows[0] ? toBus(r.rows[0]) : null;
  }
}

const toStop = (s: any): StopDTO => ({ id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng), order: s.stop_order });
const toRoute = (d: any, stops: StopDTO[]): RouteDTO => ({
  id: d.id, campusId: d.campus_id, code: d.code, name: d.name, color: d.color,
  stops: stops.sort((a, b) => a.order - b.order),
});

export class PgRouteRepository implements RouteRepository {
  constructor(private p: pg.Pool) {}
  private async withStops(rows: any[]): Promise<RouteDTO[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const stops = await this.p.query('SELECT * FROM v1.stops WHERE route_id = ANY($1)', [ids]);
    const byRoute = new Map<string, StopDTO[]>();
    for (const s of stops.rows) {
      const list = byRoute.get(s.route_id) ?? [];
      list.push(toStop(s));
      byRoute.set(s.route_id, list);
    }
    return rows.map((r) => toRoute(r, byRoute.get(r.id) ?? []));
  }
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.routes WHERE id = $1 AND campus_id = $2', [id, campusId]);
    if (!r.rows[0]) return null;
    return (await this.withStops(r.rows))[0];
  }
  async list(campusId: string, opts: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([
      this.p.query('SELECT * FROM v1.routes WHERE campus_id = $1 ORDER BY code ASC OFFSET $2 LIMIT $3', [campusId, skip, pageSize]),
      this.p.query('SELECT COUNT(*)::int AS n FROM v1.routes WHERE campus_id = $1', [campusId]),
    ]);
    return { items: await this.withStops(docs.rows), total: total.rows[0].n, page, pageSize };
  }
  async create(r: Omit<RouteDTO, 'id'>) {
    const client = await this.p.connect();
    try {
      await client.query('BEGIN');
      const routeId = newId();
      const ins = await client.query(
        `INSERT INTO v1.routes (id, campus_id, code, name, color) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [routeId, r.campusId, r.code, r.name, r.color],
      );
      const stops: StopDTO[] = [];
      for (const s of r.stops) {
        const sid = newId();
        await client.query(
          'INSERT INTO v1.stops (id, route_id, name, lat, lng, stop_order) VALUES ($1,$2,$3,$4,$5,$6)',
          [sid, routeId, s.name, s.lat, s.lng, s.order],
        );
        stops.push({ id: sid, name: s.name, lat: s.lat, lng: s.lng, order: s.order });
      }
      await client.query('COMMIT');
      return toRoute(ins.rows[0], stops);
    } catch (e) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(e, 'routes_campus_code_key')) throw new DomainError(409, 'ROUTE_CODE_TAKEN');
      throw e;
    } finally {
      client.release();
    }
  }
  async update(campusId: string, id: string, patch: Partial<Omit<RouteDTO, 'id' | 'campusId'>>) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const client = await this.p.connect();
    try {
      await client.query('BEGIN');
      const sets: string[] = ['updated_at = NOW()'];
      const vals: unknown[] = [];
      if (patch.name) { vals.push(patch.name); sets.push(`name = $${vals.length}`); }
      if (patch.color) { vals.push(patch.color); sets.push(`color = $${vals.length}`); }
      vals.push(id, campusId);
      const r = await client.query(
        `UPDATE v1.routes SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND campus_id = $${vals.length} RETURNING *`,
        vals,
      );
      if (!r.rows[0]) { await client.query('ROLLBACK'); return null; }
      if (patch.stops) {
        await client.query('DELETE FROM v1.stops WHERE route_id = $1', [id]);
        for (const s of patch.stops) {
          await client.query(
            'INSERT INTO v1.stops (id, route_id, name, lat, lng, stop_order) VALUES ($1,$2,$3,$4,$5,$6)',
            [newId(), id, s.name, s.lat, s.lng, s.order],
          );
        }
      }
      await client.query('COMMIT');
      return this.findById(campusId, id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query('DELETE FROM v1.routes WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return (r.rowCount ?? 0) > 0;
  }
}

const toTrip = (d: any): TripDTO => ({
  id: d.id, campusId: d.campus_id, busId: d.bus_id, driverId: d.driver_id, routeId: d.route_id,
  status: d.status, mode: d.mode, startedAt: d.started_at, endedAt: d.ended_at ?? null,
});

export class PgTripRepository implements TripRepository {
  constructor(private p: pg.Pool) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.trips WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return r.rows[0] ? toTrip(r.rows[0]) : null;
  }
  async findActiveByBus(campusId: string, busId: string) {
    if (!isValidId(busId) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.trips WHERE campus_id = $1 AND bus_id = $2 AND status = $3', [campusId, busId, 'ACTIVE']);
    return r.rows[0] ? toTrip(r.rows[0]) : null;
  }
  async start(t: Parameters<TripRepository['start']>[0]) {
    try {
      const r = await this.p.query(
        `INSERT INTO v1.trips (id, campus_id, bus_id, driver_id, route_id, status, mode, started_at, active_bus_key, active_driver_key)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$3,$4) RETURNING *`,
        [newId(), t.campusId, t.busId, t.driverId, t.routeId, t.mode, t.startedAt],
      );
      return toTrip(r.rows[0]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError(409, 'BUS_OR_DRIVER_HAS_ACTIVE_TRIP');
      throw e;
    }
  }
  async end(campusId: string, id: string, endedAt: Date, status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query(
      `UPDATE v1.trips SET status = $3, ended_at = $4, active_bus_key = NULL, active_driver_key = NULL
       WHERE id = $1 AND campus_id = $2 AND status = 'ACTIVE' RETURNING *`,
      [id, campusId, status, endedAt],
    );
    return r.rows[0] ? toTrip(r.rows[0]) : null;
  }
  async list(campusId: string, opts: Parameters<TripRepository['list']>[1]) {
    const { page, pageSize, skip } = pageOpts(opts);
    const params: unknown[] = [campusId];
    let where = 'campus_id = $1';
    if (opts.driverId) { params.push(opts.driverId); where += ` AND driver_id = $${params.length}`; }
    if (opts.busId) { params.push(opts.busId); where += ` AND bus_id = $${params.length}`; }
    if (opts.status) { params.push(opts.status); where += ` AND status = $${params.length}`; }
    const [docs, total] = await Promise.all([
      this.p.query(`SELECT * FROM v1.trips WHERE ${where} ORDER BY started_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`, [...params, skip, pageSize]),
      this.p.query(`SELECT COUNT(*)::int AS n FROM v1.trips WHERE ${where}`, params),
    ]);
    return { items: docs.rows.map(toTrip), total: total.rows[0].n, page, pageSize };
  }
}

const toLoc = (d: any): VehicleLocationDTO => ({
  campusId: d.campus_id, busId: d.bus_id, tripId: d.trip_id,
  location: { lat: Number(d.lat), lng: Number(d.lng) },
  accuracyM: d.accuracy_m ?? null, speedMps: d.speed_mps ?? null, speedSource: d.speed_source,
  headingDeg: d.heading_deg ?? null, capturedAt: d.captured_at, receivedAt: d.received_at, mode: d.mode,
});

export class PgVehicleLocationRepository implements VehicleLocationRepository {
  constructor(private p: pg.Pool) {}
  async applyIfNewer(loc: VehicleLocationDTO) {
    const r = await this.p.query(
      `INSERT INTO v1.vehicle_locations
         (bus_id, campus_id, trip_id, lat, lng, accuracy_m, speed_mps, speed_source, heading_deg, captured_at, received_at, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (bus_id) DO UPDATE SET
         campus_id = EXCLUDED.campus_id, trip_id = EXCLUDED.trip_id, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         accuracy_m = EXCLUDED.accuracy_m, speed_mps = EXCLUDED.speed_mps, speed_source = EXCLUDED.speed_source,
         heading_deg = EXCLUDED.heading_deg, captured_at = EXCLUDED.captured_at, received_at = EXCLUDED.received_at, mode = EXCLUDED.mode
       WHERE v1.vehicle_locations.captured_at < EXCLUDED.captured_at
       RETURNING bus_id`,
      [loc.busId, loc.campusId, loc.tripId, loc.location.lat, loc.location.lng, loc.accuracyM, loc.speedMps, loc.speedSource, loc.headingDeg, loc.capturedAt, loc.receivedAt, loc.mode],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async getByBus(campusId: string, busId: string) {
    if (!isValidId(busId) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.vehicle_locations WHERE campus_id = $1 AND bus_id = $2', [campusId, busId]);
    return r.rows[0] ? toLoc(r.rows[0]) : null;
  }
  async listByCampus(campusId: string) {
    if (!isValidId(campusId)) return [];
    const r = await this.p.query('SELECT * FROM v1.vehicle_locations WHERE campus_id = $1', [campusId]);
    return r.rows.map(toLoc);
  }
}

const toTel = (d: any): TelemetryRecord => ({
  campusId: d.campus_id, tripId: d.trip_id, busId: d.bus_id, driverId: d.driver_id, eventId: d.event_id,
  location: { lat: Number(d.lat), lng: Number(d.lng) },
  accuracyM: d.accuracy_m ?? null, speedMps: d.speed_mps ?? null, speedSource: d.speed_source,
  headingDeg: d.heading_deg ?? null, capturedAt: d.captured_at, receivedAt: d.received_at,
  liveEligible: d.live_eligible, lateSync: d.late_sync, mode: d.mode,
});

export class PgTelemetryRepository implements TelemetryRepository {
  constructor(private p: pg.Pool) {}
  async insertIdempotent(rec: TelemetryRecord) {
    try {
      await this.p.query(
        `INSERT INTO v1.telemetry
           (campus_id, trip_id, bus_id, driver_id, event_id, lat, lng, accuracy_m, speed_mps, speed_source, heading_deg, captured_at, received_at, live_eligible, late_sync, mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [rec.campusId, rec.tripId, rec.busId, rec.driverId, rec.eventId, rec.location.lat, rec.location.lng, rec.accuracyM, rec.speedMps, rec.speedSource, rec.headingDeg, rec.capturedAt, rec.receivedAt, rec.liveEligible, rec.lateSync, rec.mode],
      );
      return 'inserted' as const;
    } catch (e) {
      if (isUniqueViolation(e, 'telemetry_trip_event_key')) return 'duplicate' as const;
      throw e;
    }
  }
  async findLatestBefore(tripId: string, before: Date) {
    const r = await this.p.query(
      'SELECT * FROM v1.telemetry WHERE trip_id = $1 AND captured_at < $2 ORDER BY captured_at DESC LIMIT 1',
      [tripId, before],
    );
    return r.rows[0] ? toTel(r.rows[0]) : null;
  }
  async listByTrip(tripId: string, opts: { page?: number; pageSize?: number }) {
    const { pageSize, skip } = pageOpts(opts);
    const [docs, total] = await Promise.all([
      this.p.query('SELECT * FROM v1.telemetry WHERE trip_id = $1 ORDER BY captured_at ASC OFFSET $2 LIMIT $3', [tripId, skip, pageSize]),
      this.p.query('SELECT COUNT(*)::int AS n FROM v1.telemetry WHERE trip_id = $1', [tripId]),
    ]);
    return { items: docs.rows.map(toTel), total: total.rows[0].n };
  }
  async purgeReceivedBefore(cutoff: Date) {
    const r = await this.p.query('DELETE FROM v1.telemetry WHERE received_at < $1', [cutoff]);
    return r.rowCount ?? 0;
  }
}

const toSched = (d: any): ScheduleDTO => ({
  id: d.id, campusId: d.campus_id, routeId: d.route_id, busId: d.bus_id,
  direction: d.direction, daysOfWeek: d.days_of_week, departTime: d.depart_time, active: d.active ?? true,
});

export class PgScheduleRepository implements ScheduleRepository {
  constructor(private p: pg.Pool) {}
  async findById(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const r = await this.p.query('SELECT * FROM v1.schedules WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return r.rows[0] ? toSched(r.rows[0]) : null;
  }
  async list(campusId: string, opts: { routeId?: string; day?: number; active?: boolean; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const params: unknown[] = [campusId];
    let where = 'campus_id = $1';
    if (opts.routeId) { params.push(opts.routeId); where += ` AND route_id = $${params.length}`; }
    if (opts.day !== undefined) { params.push(opts.day); where += ` AND $${params.length} = ANY(days_of_week)`; }
    if (opts.active !== undefined) { params.push(opts.active); where += ` AND active = $${params.length}`; }
    const [docs, total] = await Promise.all([
      this.p.query(`SELECT * FROM v1.schedules WHERE ${where} ORDER BY depart_time ASC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`, [...params, skip, pageSize]),
      this.p.query(`SELECT COUNT(*)::int AS n FROM v1.schedules WHERE ${where}`, params),
    ]);
    return { items: docs.rows.map(toSched), total: total.rows[0].n, page, pageSize };
  }
  async create(s: Omit<ScheduleDTO, 'id'>) {
    const r = await this.p.query(
      `INSERT INTO v1.schedules (id, campus_id, route_id, bus_id, direction, days_of_week, depart_time, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [newId(), s.campusId, s.routeId, s.busId, s.direction, s.daysOfWeek, s.departTime, s.active],
    );
    return toSched(r.rows[0]);
  }
  async update(campusId: string, id: string, patch: Partial<Omit<ScheduleDTO, 'id' | 'campusId'>>) {
    if (!isValidId(id) || !isValidId(campusId)) return null;
    const sets: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (patch.routeId !== undefined) add('route_id', patch.routeId);
    if (patch.busId !== undefined) add('bus_id', patch.busId);
    if (patch.direction !== undefined) add('direction', patch.direction);
    if (patch.daysOfWeek !== undefined) add('days_of_week', patch.daysOfWeek);
    if (patch.departTime !== undefined) add('depart_time', patch.departTime);
    if (patch.active !== undefined) add('active', patch.active);
    vals.push(id, campusId);
    const r = await this.p.query(
      `UPDATE v1.schedules SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND campus_id = $${vals.length} RETURNING *`,
      vals,
    );
    return r.rows[0] ? toSched(r.rows[0]) : null;
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query('DELETE FROM v1.schedules WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return (r.rowCount ?? 0) > 0;
  }
}

const toNotif = (d: any): NotificationDTO => ({
  id: d.id, campusId: d.campus_id, kind: d.kind, priority: d.priority,
  title: d.title, body: d.body, routeId: d.route_id ?? null, createdBy: d.created_by,
  expiresAt: d.expires_at ?? null, createdAt: d.created_at,
});

export class PgNotificationRepository implements NotificationRepository {
  constructor(private p: pg.Pool) {}
  async list(campusId: string, opts: { routeId?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const params: unknown[] = [campusId];
    let where = 'campus_id = $1';
    if (opts.routeId) { params.push(opts.routeId); where += ` AND route_id = $${params.length}`; }
    const [docs, total] = await Promise.all([
      this.p.query(`SELECT * FROM v1.notifications WHERE ${where} ORDER BY created_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`, [...params, skip, pageSize]),
      this.p.query(`SELECT COUNT(*)::int AS n FROM v1.notifications WHERE ${where}`, params),
    ]);
    return { items: docs.rows.map(toNotif), total: total.rows[0].n, page, pageSize };
  }
  async create(n: Omit<NotificationDTO, 'id' | 'createdAt'>) {
    const r = await this.p.query(
      `INSERT INTO v1.notifications (id, campus_id, kind, priority, title, body, route_id, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newId(), n.campusId, n.kind, n.priority, n.title, n.body, n.routeId ?? null, n.createdBy, n.expiresAt ?? null],
    );
    return toNotif(r.rows[0]);
  }
  async delete(campusId: string, id: string) {
    if (!isValidId(id) || !isValidId(campusId)) return false;
    const r = await this.p.query('DELETE FROM v1.notifications WHERE id = $1 AND campus_id = $2', [id, campusId]);
    return (r.rowCount ?? 0) > 0;
  }
}

const toAlert = (d: any): EmergencyAlertDTO => ({
  id: d.id, campusId: d.campus_id, busId: d.bus_id, tripId: d.trip_id ?? null,
  raisedBy: d.raised_by, status: d.status, message: d.message ?? null,
  location: d.lat != null && d.lng != null ? { lat: Number(d.lat), lng: Number(d.lng) } : null,
  createdAt: d.created_at,
  acknowledgedBy: d.acknowledged_by ?? null, acknowledgedAt: d.acknowledged_at ?? null,
  resolvedBy: d.resolved_by ?? null, resolvedAt: d.resolved_at ?? null,
});

export class PgEmergencyAlertRepository implements EmergencyAlertRepository {
  constructor(private p: pg.Pool) {}
  async list(campusId: string, opts: { status?: AlertStatus; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = pageOpts(opts);
    const params: unknown[] = [campusId];
    let where = 'campus_id = $1';
    if (opts.status) { params.push(opts.status); where += ` AND status = $${params.length}`; }
    const [docs, total] = await Promise.all([
      this.p.query(`SELECT * FROM v1.emergency_alerts WHERE ${where} ORDER BY created_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`, [...params, skip, pageSize]),
      this.p.query(`SELECT COUNT(*)::int AS n FROM v1.emergency_alerts WHERE ${where}`, params),
    ]);
    return { items: docs.rows.map(toAlert), total: total.rows[0].n, page, pageSize };
  }
  async create(a: Omit<EmergencyAlertDTO, 'id' | 'createdAt'>) {
    const r = await this.p.query(
      `INSERT INTO v1.emergency_alerts (id, campus_id, bus_id, trip_id, raised_by, status, message, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newId(), a.campusId, a.busId, a.tripId ?? null, a.raisedBy, a.status, a.message ?? null, a.location?.lat ?? null, a.location?.lng ?? null],
    );
    return toAlert(r.rows[0]);
  }
  async acknowledge(campusId: string, id: string, byUserId: string, at: Date) {
    if (!isValidId(id)) return null;
    const r = await this.p.query(
      `UPDATE v1.emergency_alerts SET status = 'ACKNOWLEDGED', acknowledged_by = $3, acknowledged_at = $4
       WHERE id = $1 AND campus_id = $2 AND status = 'OPEN' RETURNING *`,
      [id, campusId, byUserId, at],
    );
    return r.rows[0] ? toAlert(r.rows[0]) : null;
  }
  async resolve(campusId: string, id: string, byUserId: string, at: Date) {
    if (!isValidId(id)) return null;
    const r = await this.p.query(
      `UPDATE v1.emergency_alerts SET status = 'RESOLVED', resolved_by = $3, resolved_at = $4
       WHERE id = $1 AND campus_id = $2 AND status IN ('OPEN','ACKNOWLEDGED') RETURNING *`,
      [id, campusId, byUserId, at],
    );
    return r.rows[0] ? toAlert(r.rows[0]) : null;
  }
}

const toCampus = (d: any): CampusDTO => ({
  id: d.id, name: d.name, shortCode: d.short_code, city: d.city ?? '',
  lat: Number(d.lat), lng: Number(d.lng), zoom: d.zoom ?? 15, timezone: d.timezone ?? 'UTC',
});

export class PgCampusRepository implements CampusRepository {
  constructor(private p: pg.Pool) {}
  async list() {
    const r = await this.p.query('SELECT * FROM v1.campuses ORDER BY name ASC');
    return r.rows.map(toCampus);
  }
  async findById(id: string) {
    if (!isValidId(id)) return null;
    const r = await this.p.query('SELECT * FROM v1.campuses WHERE id = $1', [id]);
    return r.rows[0] ? toCampus(r.rows[0]) : null;
  }
  async findByCode(shortCode: string) {
    const r = await this.p.query('SELECT * FROM v1.campuses WHERE short_code = $1', [shortCode.toUpperCase()]);
    return r.rows[0] ? toCampus(r.rows[0]) : null;
  }
  async create(c: Omit<CampusDTO, 'id'>) {
    const r = await this.p.query(
      `INSERT INTO v1.campuses (id, name, short_code, city, lat, lng, zoom, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [newId(), c.name, c.shortCode.toUpperCase(), c.city, c.lat, c.lng, c.zoom, c.timezone],
    );
    return toCampus(r.rows[0]);
  }
}

export function createPostgresRepositories(pool: pg.Pool) {
  return {
    campuses: new PgCampusRepository(pool),
    users: new PgUserRepository(pool),
    schedules: new PgScheduleRepository(pool),
    notifications: new PgNotificationRepository(pool),
    alerts: new PgEmergencyAlertRepository(pool),
    refreshTokens: new PgRefreshTokenRepository(pool),
    emailTokens: new PgEmailTokenRepository(pool),
    buses: new PgBusRepository(pool),
    routes: new PgRouteRepository(pool),
    trips: new PgTripRepository(pool),
    live: new PgVehicleLocationRepository(pool),
    telemetry: new PgTelemetryRepository(pool),
  };
}

export type Repositories = ReturnType<typeof createPostgresRepositories>;
