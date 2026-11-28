import { describe, expect, it } from 'vitest';
import { confirmTripChange, needsTripConfirmation } from '../src/services/tripReconciliation';
import type { V1Trip } from '../src/services/v1/trips';

const active: V1Trip = {
  id: 'trip-1', busId: 'bus-1', driverId: 'driver-1', campusId: 'campus-1', routeId: 'route-1',
  status: 'ACTIVE', mode: 'REAL', startedAt: '2026-11-28T08:00:00Z',
};

describe('trip reconciliation', () => {
  it('adopts only an active trip for the requested driver and bus', () => {
    const change = { kind: 'starting', busId: active.busId, driverId: active.driverId } as const;
    expect(confirmTripChange(change, active)).toBe(active);
    expect(confirmTripChange(change, { ...active, driverId: 'driver-2' })).toBeUndefined();
    expect(confirmTripChange(change, { ...active, busId: 'bus-2' })).toBeUndefined();
    expect(confirmTripChange(change, { ...active, status: 'COMPLETED' })).toBeUndefined();
  });

  it('requires an exact terminal trip after an uncertain end', () => {
    const change = { kind: 'ending', tripId: active.id } as const;
    expect(confirmTripChange(change, undefined)).toBeUndefined();
    expect(confirmTripChange(change, active)).toBeUndefined();
    expect(confirmTripChange(change, { ...active, id: 'trip-2', status: 'COMPLETED' })).toBeUndefined();
    expect(confirmTripChange(change, { ...active, status: 'CANCELLED' })?.status).toBe('CANCELLED');
  });

  it('queries the server after a timeout, conflict or unavailable response', () => {
    expect(needsTripConfirmation({ status: 0 })).toBe(true);
    expect(needsTripConfirmation({ status: 409 })).toBe(true);
    expect(needsTripConfirmation({ status: 504 })).toBe(true);
    expect(needsTripConfirmation({ status: 403 })).toBe(false);
  });
});
