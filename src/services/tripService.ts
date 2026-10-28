import { Trip } from '../types';
import { apiClient } from './apiClient';
import { locationService } from './locationService';
import { realtimeService } from './realtimeService';
import { socketService } from './socketService';

const ACTIVE_TRIP_KEY = 'smart_campus_bus_active_trip';

class TripService {
  private trips: Trip[] = [];
  private activeTrip: Trip | null = null;
  private listeners: ((trip: Trip | null) => void)[] = [];

  constructor() {
    const saved = localStorage.getItem(ACTIVE_TRIP_KEY);
    if (saved) try { this.activeTrip = JSON.parse(saved); } catch { this.activeTrip = null; }
    this.refreshActiveTripFromApi();
    this.fetchTripHistory();
    socketService.on('trip:started', () => this.fetchTripHistory());
    socketService.on('trip:ended', () => this.fetchTripHistory());
    socketService.on('trip:stop_arrived', (data: any) => {
      if (this.activeTrip && this.activeTrip.id === data.tripId) {
        this.activeTrip = {
          ...this.activeTrip,
          currentStopId: data.arrivedStop?.id || this.activeTrip.currentStopId,
          nextStopId: data.nextStop ? data.nextStop.id : null,
          completedStopIds: data.completedStopIds || this.activeTrip.completedStopIds,
        };
        this.persistActiveTrip();
        this.notify();
      }
    });
  }

  public getActiveTrip(): Trip | null { return this.activeTrip; }
  public getTripHistory(): Trip[] { return [...this.trips]; }

  public subscribeActiveTrip(listener: (trip: Trip | null) => void): () => void {
    this.listeners.push(listener); listener(this.activeTrip);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  public async refreshActiveTripFromApi(): Promise<Trip | null> {
    try {
      const res = await apiClient.get<{ activeTrip: Trip | null }>('/api/trips/active');
      this.activeTrip = res.activeTrip; this.persistActiveTrip(); this.notify();
      return this.activeTrip;
    } catch { return this.activeTrip; }
  }

  public async fetchTripHistory(): Promise<Trip[]> {
    try {
      const res = await apiClient.get<Trip[]>('/api/trips');
      if (Array.isArray(res)) { this.trips = res; this.notify(); }
    } catch (err) { console.warn('Could not load trip history:', err); }
    return this.trips;
  }

  public async startTrip(busId: string, driverId: string, routeId: string, collegeId = 'college_apex', useSimulation = false): Promise<Trip> {
    try {
      const res = await apiClient.post<{ success: boolean; trip: any; bus: any }>('/api/trips/start', { busId, routeId, collegeId });
      const st = res.trip;
      const newTrip: Trip = {
        id: st.id, collegeId: st.college_id || collegeId, busId: st.bus_id || busId, driverId: st.driver_id || driverId,
        routeId: st.route_id || routeId, startTime: st.start_time || new Date().toISOString(), status: 'IN_PROGRESS',
        currentOccupancy: 0, initialOccupancy: 0, totalLocationsLogged: 0, syncedLocationsCount: 0,
        queuedLocationsCount: 0, distanceCoveredKm: 0,
        currentStopId: st.current_stop_id || null,
        nextStopId: st.next_stop_id || null,
        completedStopIds: st.completed_stop_ids || [],
        stopArrivals: st.stop_arrivals || [],
      };
      this.activeTrip = newTrip; this.trips.unshift(newTrip); this.persistActiveTrip(); this.notify();
      await locationService.startTracking(newTrip.id, busId, driverId, useSimulation);
      return newTrip;
    } catch (err: any) {
      throw err;
    }
  }

  public async updateOccupancy(deltaOrAbsolute: number, isAbsolute = false): Promise<number> {
    if (!this.activeTrip) return 0;
    try {
      const res = await apiClient.post<{ currentOccupancy: number; capacity: number }>('/api/trips/occupancy',
        { delta: isAbsolute ? undefined : deltaOrAbsolute, absoluteCount: isAbsolute ? deltaOrAbsolute : undefined });
      this.activeTrip.currentOccupancy = res.currentOccupancy; this.persistActiveTrip(); this.notify();
      return res.currentOccupancy;
    } catch {
      const bus = realtimeService.getBusById(this.activeTrip.busId);
      const cap = bus?.capacity || 45;
      let nc = isAbsolute ? deltaOrAbsolute : this.activeTrip.currentOccupancy + deltaOrAbsolute;
      nc = Math.max(0, Math.min(cap, nc));
      this.activeTrip.currentOccupancy = nc; this.persistActiveTrip(); this.notify();
      return nc;
    }
  }

  public async endTrip(): Promise<boolean> {
    if (!this.activeTrip) return false;
    try { await apiClient.post('/api/trips/end', { tripId: this.activeTrip.id }); } catch { /* offline */ }
    locationService.stopTracking();
    const et = { ...this.activeTrip, status: 'COMPLETED' as const, endTime: new Date().toISOString() };
    this.trips = this.trips.map((t) => (t.id === et.id ? et : t));
    this.activeTrip = null; localStorage.removeItem(ACTIVE_TRIP_KEY); this.notify();
    return true;
  }

  private persistActiveTrip(): void {
    if (this.activeTrip) localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(this.activeTrip));
    else localStorage.removeItem(ACTIVE_TRIP_KEY);
  }
  private notify(): void { this.listeners.forEach((l) => l(this.activeTrip)); }
}
export const tripService = new TripService();
