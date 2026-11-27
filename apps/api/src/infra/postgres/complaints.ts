import type pg from 'pg';
import { DomainError } from '../../domain/errors';
import type { Complaint, ComplaintRepository, NewComplaint } from '../../domain/types';
import { newId } from './ids';

interface ComplaintRow {
  id: string; campus_id: string; student_id: string; student_name: string;
  title: string; description: string; category: Complaint['category']; priority: Complaint['priority']; status: Complaint['status'];
  trip_id: string | null; bus_id: string | null; route_id: string | null; admin_response: string | null;
  responded_at: Date | null; resolved_at: Date | null; closed_at: Date | null; created_at: Date; updated_at: Date;
}

const project = (row: ComplaintRow): Complaint => ({
  id: row.id, campusId: row.campus_id, studentId: row.student_id, studentName: row.student_name,
  title: row.title, description: row.description, category: row.category, priority: row.priority, status: row.status,
  tripId: row.trip_id ?? undefined, busId: row.bus_id ?? undefined, routeId: row.route_id ?? undefined,
  adminResponse: row.admin_response, respondedAt: row.responded_at, resolvedAt: row.resolved_at, closedAt: row.closed_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const joinStudent = 'JOIN v1.users u ON u.id = c.student_id AND u.campus_id = c.campus_id';
const readable = 'c.campus_id = $1 AND ($2::varchar IS NULL OR c.student_id = $2)';

export class PgComplaintRepository implements ComplaintRepository {
  constructor(private pool: pg.Pool) {}

  async list(campusId: string, studentId: string | null, { page = 1, pageSize = 25 }) {
    const [results, count] = await Promise.all([
      this.pool.query<ComplaintRow>(
        `SELECT c.*, u.name AS student_name FROM v1.complaints c ${joinStudent}
         WHERE ${readable} ORDER BY c.created_at DESC, c.id LIMIT $3 OFFSET $4`,
        [campusId, studentId, pageSize, (page - 1) * pageSize],
      ),
      this.pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM v1.complaints c WHERE ${readable}`, [campusId, studentId]),
    ]);
    return { items: results.rows.map(project), total: count.rows[0]!.total, page, pageSize };
  }

  async find(campusId: string, id: string, studentId: string | null) {
    const { rows } = await this.pool.query<ComplaintRow>(
      `SELECT c.*, u.name AS student_name FROM v1.complaints c ${joinStudent} WHERE ${readable} AND c.id = $3`,
      [campusId, studentId, id],
    );
    return rows[0] ? project(rows[0]) : null;
  }

  async create(body: NewComplaint) {
    const { rows } = await this.pool.query<ComplaintRow>(
      `WITH c AS (
         INSERT INTO v1.complaints (id, campus_id, student_id, title, description, category, priority, trip_id, bus_id, route_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
       ) SELECT c.*, u.name AS student_name FROM c ${joinStudent}`,
      [newId(), body.campusId, body.studentId, body.title, body.description, body.category, body.priority,
        body.tripId ?? null, body.busId ?? null, body.routeId ?? null],
    );
    return project(rows[0]!);
  }

  async update(campusId: string, id: string, actorId: string, patch: Parameters<ComplaintRepository['update']>[3]) {
    const { rows } = await this.pool.query<ComplaintRow>(
      `WITH c AS (
         UPDATE v1.complaints SET
           status = COALESCE($3::varchar, status), priority = COALESCE($4::varchar, priority),
           admin_response = COALESCE($5::varchar, admin_response),
           responded_by = CASE WHEN $5::varchar IS NOT NULL THEN $6 ELSE responded_by END,
           responded_at = CASE WHEN $5::varchar IS NOT NULL THEN NOW() ELSE responded_at END,
           resolved_at = CASE WHEN $3 = 'RESOLVED' THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END,
           closed_at = CASE WHEN $3 = 'CLOSED' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
           updated_at = NOW()
         WHERE campus_id = $1 AND id = $2 AND (
           ($3::varchar IS NULL AND status <> 'CLOSED') OR
           ($3 = status AND status <> 'CLOSED') OR
           (status = 'OPEN' AND $3 IN ('IN_PROGRESS', 'RESOLVED')) OR
           (status = 'IN_PROGRESS' AND $3 = 'RESOLVED') OR
           (status = 'RESOLVED' AND $3 = 'CLOSED')
         )
         RETURNING *
       ) SELECT c.*, u.name AS student_name FROM c ${joinStudent}`,
      [campusId, id, patch.status ?? null, patch.priority ?? null, patch.adminResponse ?? null, actorId],
    );
    if (rows[0]) return project(rows[0]);
    if (await this.find(campusId, id, null)) throw new DomainError(409, 'INVALID_COMPLAINT_TRANSITION');
    return null;
  }
}
