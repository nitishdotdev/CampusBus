import type { TrackingConfig } from '../config/env';
import { forbidden, notFound, conflict, badRequest } from './errors';
import type { BusRepository, Principal, TripDTO, TripMode, TripRepository, UserRepository } from './types';

export class TripService {
  constructor(private d: { users: UserRepository; buses: BusRepository; trips: TripRepository; config: TrackingConfig; now?: () => Date }) {}
  private now() { return (this.d.now ?? (() => new Date()))(); }

  /** A driver may start a trip only on the bus assigned to them. Simulation is a server-side capability. */
  async start(p: Principal, input: { busId: string; simulated?: boolean }): Promise<TripDTO> {
    if (p.role !== 'DRIVER') throw forbidden('DRIVER_ROLE_REQUIRED');
    const user = await this.d.users.findById(p.campusId, p.userId);
    if (!user || user.status !== 'ACTIVE') throw forbidden('ACCOUNT_NOT_ACTIVE');
    const bus = await this.d.buses.findById(p.campusId, input.busId);
    if (!bus || bus.driverId !== p.userId) throw forbidden('NOT_ASSIGNED_TO_BUS');
    if (bus.status !== 'ACTIVE') throw conflict('BUS_NOT_IN_SERVICE');
    if (!bus.routeId) throw badRequest('BUS_HAS_NO_ROUTE');
    let mode: TripMode = 'REAL';
    if (input.simulated) {
      if (!this.d.config.simulationEnabled) throw forbidden('SIMULATION_DISABLED');
      mode = 'SIMULATED';
    }
    return this.d.trips.start({ campusId: p.campusId, busId: bus.id, driverId: p.userId, routeId: bus.routeId, mode, startedAt: this.now() });
  }

  async end(p: Principal, tripId: string): Promise<TripDTO> {
    const trip = await this.d.trips.findById(p.campusId, tripId);
    if (!trip || (p.role === 'DRIVER' && trip.driverId !== p.userId) || (p.role === 'STUDENT')) throw notFound('TRIP_NOT_FOUND');
    const ended = await this.d.trips.end(p.campusId, tripId, this.now());
    if (!ended) throw conflict('TRIP_NOT_ACTIVE');
    return ended;
  }
}
