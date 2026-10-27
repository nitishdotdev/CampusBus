import { describe, expect, it } from 'vitest';
import { assertAssignableDriver } from '../apps/api/src/domain/assignDriver';

const CAMPUS_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CAMPUS_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const BUS_ID = 'cccccccccccccccccccccccc';
const DRIVER_ID = 'dddddddddddddddddddddddd';
const STUDENT_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

const activeDriver = {
  id: DRIVER_ID,
  campusId: CAMPUS_A,
  email: 'd@t.test',
  name: 'Drv',
  role: 'DRIVER' as const,
  status: 'ACTIVE' as const,
  emailVerifiedAt: null,
};

const bus = {
  id: BUS_ID,
  campusId: CAMPUS_A,
  number: 'B1',
  capacity: 40,
  status: 'ACTIVE' as const,
  driverId: null,
  routeId: null,
};

describe('assertAssignableDriver', () => {
  it('allows unassign without a driver lookup', () => {
    expect(() => assertAssignableDriver({ bus, driver: null, driverId: null })).not.toThrow();
  });

  it('allows an ACTIVE same-campus DRIVER', () => {
    expect(() =>
      assertAssignableDriver({ bus, driver: activeDriver, driverId: DRIVER_ID }),
    ).not.toThrow();
  });

  it('rejects a missing bus', () => {
    expect(() =>
      assertAssignableDriver({ bus: null, driver: activeDriver, driverId: DRIVER_ID }),
    ).toMatchObject({});
    try {
      assertAssignableDriver({ bus: null, driver: activeDriver, driverId: DRIVER_ID });
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.code).toBe('BUS_NOT_FOUND');
    }
  });

  it('rejects a missing driver without mutating the bus', () => {
    try {
      assertAssignableDriver({ bus, driver: null, driverId: DRIVER_ID });
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.code).toBe('DRIVER_NOT_FOUND');
    }
  });

  it('rejects a student target', () => {
    try {
      assertAssignableDriver({
        bus,
        driver: { ...activeDriver, id: STUDENT_ID, role: 'STUDENT' },
        driverId: STUDENT_ID,
      });
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('NOT_A_DRIVER');
    }
  });

  it('rejects a cross-campus driver', () => {
    try {
      assertAssignableDriver({
        bus,
        driver: { ...activeDriver, campusId: CAMPUS_B },
        driverId: DRIVER_ID,
      });
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.code).toBe('DRIVER_NOT_FOUND');
    }
  });

  it('rejects PENDING, REJECTED, and DISABLED drivers', () => {
    for (const status of ['PENDING', 'REJECTED', 'DISABLED'] as const) {
      try {
        assertAssignableDriver({
          bus,
          driver: { ...activeDriver, status },
          driverId: DRIVER_ID,
        });
        throw new Error('expected throw');
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('DRIVER_NOT_ELIGIBLE');
      }
    }
  });
});
