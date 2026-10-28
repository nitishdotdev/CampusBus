import { badRequest, forbidden, notFound } from './errors';
import type { BusDTO, Principal, UserDTO } from './types';

/**
 * Resource-level policy for observing a bus's position. Campus scoping is already guaranteed because
 * every repository call is made with the principal's campusId; this adds the per-resource rule.
 * - ADMIN:   any bus in the campus
 * - DRIVER:  only the bus they are assigned to
 * - STUDENT: the bus they are assigned to, or any bus serving the route they are assigned to
 */
export function canViewBus(principal: Principal, user: UserDTO, bus: BusDTO): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (bus.campusId !== principal.campusId || user.campusId !== principal.campusId) return false;
  switch (user.role) {
    case 'ADMIN': return true;
    case 'DRIVER': return bus.driverId === user.id;
    case 'STUDENT':
      return (!!user.assignedBusId && user.assignedBusId === bus.id)
        || (!!user.assignedRouteId && !!bus.routeId && user.assignedRouteId === bus.routeId);
    default: return false;
  }
}

/** Server-side checks before assigning a user as a bus driver. Never trusts client-supplied role or campus. */
export function assertAssignableDriver(campusId: string, driver: UserDTO | null): asserts driver is UserDTO {
  if (!driver || driver.campusId !== campusId) throw notFound('DRIVER_NOT_FOUND');
  if (driver.role !== 'DRIVER') throw badRequest('TARGET_NOT_DRIVER');
  if (driver.status !== 'ACTIVE') throw forbidden('DRIVER_NOT_ELIGIBLE');
}
