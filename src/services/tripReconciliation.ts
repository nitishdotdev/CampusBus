import type { V1Trip } from './v1/trips';

export type TripChange =
  | { kind: 'starting'; busId: string; driverId: string }
  | { kind: 'ending'; tripId: string };

export function confirmTripChange(change: TripChange, trip: V1Trip | undefined): V1Trip | undefined {
  if (!trip) return undefined;
  if (change.kind === 'starting') {
    return trip.status === 'ACTIVE' && trip.busId === change.busId && trip.driverId === change.driverId ? trip : undefined;
  }
  return trip.id === change.tripId && trip.status !== 'ACTIVE' ? trip : undefined;
}

export function needsTripConfirmation(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error) || typeof error.status !== 'number') return true;
  return error.status === 0 || error.status === 409 || error.status >= 500;
}
