import { badRequest, forbidden, notFound } from './errors';
import type { BusDTO, UserDTO } from './types';

export function assertAssignableDriver(input: {
  bus: BusDTO | null;
  driver: UserDTO | null;
  driverId: string | null;
}): void {
  if (!input.bus) throw notFound('BUS_NOT_FOUND');
  if (input.driverId === null) return;
  const driver = input.driver;
  if (!driver || driver.campusId !== input.bus.campusId) throw notFound('DRIVER_NOT_FOUND');
  if (driver.role !== 'DRIVER') throw badRequest('NOT_A_DRIVER');
  if (driver.status !== 'ACTIVE') throw forbidden('DRIVER_NOT_ELIGIBLE');
}
