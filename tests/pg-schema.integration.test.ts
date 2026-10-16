// Exercises the PostgreSQL code paths against a disposable database.
// Skipped unless PG_TEST_URL is set, e.g. PG_TEST_URL=postgres://postgres@localhost:54330/cm_scratch npm test
// NEVER point this at a production database: it creates and mutates rows.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const URL_ = process.env.PG_TEST_URL;

describe.skipIf(!URL_)('PostgreSQL schema and schedule/complaint persistence', () => {
  let db: any; let pg: any; let collegeId = ''; let busId = ''; let routeId = '';
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_; process.env.NODE_ENV = 'development'; process.env.DATABASE_SSL_MODE = 'disable';
    const mod = await import('../server/db');
    pg = await mod.initDatabase();
    db = mod.db;
    collegeId = (await db.getColleges())[0].id;
    busId = (await db.getBuses(collegeId))[0].id;
    routeId = (await db.getRoutes(collegeId))[0].id;
  });

  it('runs in PostgreSQL mode', () => { expect(pg.isPostgres).toBe(true); });

  it('creates, reads, updates and deletes a schedule', async () => {
    const now = new Date().toISOString();
    const rec = await db.createSchedule({ id: 'sch_pgtest', college_id: collegeId, bus_id: busId, route_id: routeId,
      departure_time: '08:15', operating_days: ['Monday', 'Tuesday'], status: 'ACTIVE', created_at: now, updated_at: now });
    expect(rec.id).toBe('sch_pgtest');
    expect((await db.getSchedules(collegeId, undefined, undefined, 'Monday')).map((s: any) => s.id)).toContain('sch_pgtest');
    expect((await db.getSchedules(collegeId, undefined, undefined, 'Sunday')).map((s: any) => s.id)).not.toContain('sch_pgtest');
    const upd = await db.updateSchedule('sch_pgtest', collegeId, { status: 'CANCELLED' });
    expect(upd.status).toBe('CANCELLED');
    expect(await db.getScheduleById('sch_pgtest', 'other_college')).toBeNull();
    expect(await db.deleteSchedule('sch_pgtest', collegeId)).toBe(true);
  });

  it('creates and lists a complaint', async () => {
    const { Pool } = await import('pg');
    const p = new Pool({ connectionString: URL_ });
    const stu = (await p.query("SELECT id FROM users WHERE role='STUDENT' LIMIT 1")).rows[0];
    await p.end();
    expect(stu).toBeTruthy();
    const now = new Date().toISOString();
    const c = await db.createComplaint({ id: 'cmp_pgtest', college_id: collegeId, student_id: stu.id, title: 'Late bus',
      description: 'Arrived 20 minutes late', category: 'SCHEDULE_ISSUE', status: 'OPEN', priority: 'NORMAL', created_at: now, updated_at: now });
    expect(c.id).toBe('cmp_pgtest');
    expect((await db.getComplaints(collegeId)).map((x: any) => x.id)).toContain('cmp_pgtest');
    await db.deleteComplaint('cmp_pgtest', collegeId);
  });
});
