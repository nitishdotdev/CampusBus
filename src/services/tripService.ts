import type { Trip } from '../types';
import { locationService } from './locationService';
import { v1TripToUi } from './v1/adapters';
import type { V1Trip } from './v1/trips';

class TripService {
  private activeTrip: Trip | null = null;
  private listeners = new Set<(trip: Trip | null) => void>();

  public getActiveTrip(): Trip | null { return this.activeTrip; }

  public subscribeActiveTrip(listener: (trip: Trip | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.activeTrip);
    return () => this.listeners.delete(listener);
  }

  public adoptV1Trip(record: V1Trip): Trip {
    const trip = v1TripToUi(record);
    this.activeTrip = trip;
    this.notify();
    return trip;
  }

  public clearActiveTrip(): void {
    locationService.stopTracking();
    this.activeTrip = null;
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener(this.activeTrip);
  }
}

export const tripService = new TripService();
