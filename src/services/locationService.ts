import type { GPSStatus, NetworkStatus, LocationPoint, QueuedLocationUpdate } from '../types';
import { offlineQueueService } from './offlineQueue';
import { telemetryV1 } from './v1/telemetry';

export interface LocationServiceState {
  gpsStatus: GPSStatus;
  networkStatus: NetworkStatus;
  isTracking: boolean;
  isSimulated: boolean;
  lastLocation: LocationPoint | null;
  lastSyncTime: string | null;
  queuedCount: number;
  errorMessage: string | null;
  isSimulatedOffline: boolean;
}

const toEvent = (item: QueuedLocationUpdate) => ({
  eventId: item.id, lat: item.lat, lng: item.lng, accuracyM: item.accuracy,
  speedMps: item.speed ?? undefined, headingDeg: item.heading ?? undefined, capturedAt: item.timestamp,
});

class LocationService {
  private watchId: number | null = null;
  private generation = 0;
  private syncing = false;
  private retryAt = 0;
  private failures = 0;
  private listeners = new Set<(state: LocationServiceState) => void>();
  private reportingInterval = 3000;
  private driverId: string | null = null;
  private state: LocationServiceState = {
    gpsStatus: 'GPS_PERMISSION_REQUIRED',
    networkStatus: navigator.onLine ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
    isTracking: false, isSimulated: false, lastLocation: null, lastSyncTime: null,
    queuedCount: 0, errorMessage: null, isSimulatedOffline: false,
  };

  constructor() {
    window.addEventListener('online', () => this.networkChanged());
    window.addEventListener('offline', () => this.networkChanged());
    window.setInterval(() => {
      const last = this.state.lastLocation;
      if (this.state.isTracking && last && this.state.gpsStatus === 'GPS_ACTIVE' && Date.now() - Date.parse(last.timestamp) > 20_000) {
        this.state.gpsStatus = 'LOCATION_STALE';
        this.notify();
      }
      void this.attemptSyncQueuedLocations();
    }, 4000);
  }

  public setReportingInterval(seconds: number) { this.reportingInterval = seconds * 1000; }

  public getState(): LocationServiceState { return { ...this.state }; }

  public subscribe(listener: (state: LocationServiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public setDriver(driverId: string | null): void {
    if (this.driverId === driverId) return;
    this.stopTracking();
    this.driverId = driverId;
    this.state.queuedCount = 0;
    this.state.isSimulatedOffline = false;
    this.networkChanged();
  }

  public toggleSimulatedOffline(simulateOffline: boolean): void {
    if (import.meta.env.PROD) return;
    this.state.isSimulatedOffline = simulateOffline;
    this.networkChanged();
  }

  public startTracking(tripId: string, busId: string, driverId: string, _useSimulation = false): void {
    this.setDriver(driverId);
    this.stopTracking();
    const generation = this.generation;
    this.state.isTracking = true;
    this.state.gpsStatus = 'GPS_SEARCHING';
    this.notify();

    if (!navigator.geolocation) {
      this.state.gpsStatus = 'GPS_UNAVAILABLE';
      this.state.errorMessage = 'This browser does not support location access.';
      this.notify();
      return;
    }

    let lastReported = 0;
    this.watchId = navigator.geolocation.watchPosition(position => {
      if (generation !== this.generation) return;
      const { latitude: lat, longitude: lng, accuracy, speed, heading } = position.coords;
      const timestamp = new Date(position.timestamp).toISOString();
      this.state.lastLocation = { lat, lng, accuracy, speed, heading, timestamp };
      this.state.gpsStatus = accuracy > 65 ? 'GPS_UNAVAILABLE' : 'GPS_ACTIVE';
      this.state.errorMessage = accuracy > 65 ? 'Location accuracy is low. Keep the device near a window with a clear view of the sky.' : null;
      this.notify();
      if (position.timestamp - lastReported < this.reportingInterval) return;
      lastReported = position.timestamp;
      const item = { id: `loc_${crypto.randomUUID()}`, tripId, busId, driverId, lat, lng, accuracy, speed, heading, timestamp, attemptCount: 0 };
      void offlineQueueService.enqueue(item).then(() => {
        if (this.driverId !== driverId) return;
        this.state.queuedCount += 1;
        void this.attemptSyncQueuedLocations();
      });
    }, error => {
      if (generation !== this.generation) return;
      this.state.gpsStatus = error.code === 1 ? 'GPS_PERMISSION_REQUIRED' : 'GPS_UNAVAILABLE';
      this.state.errorMessage = error.code === 1 ? 'Location access is blocked. Allow location in the browser settings, then retry GPS.' : 'No location fix yet. Move to an open area or retry GPS.';
      this.notify();
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
  }

  public stopTracking(): void {
    this.generation++;
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.state.isTracking = false;
    this.state.gpsStatus = 'GPS_PERMISSION_REQUIRED';
    this.state.lastLocation = null;
    this.state.lastSyncTime = null;
    this.state.errorMessage = null;
    this.notify();
  }

  public async attemptSyncQueuedLocations(): Promise<void> {
    const driverId = this.driverId;
    if (!driverId || this.syncing || Date.now() < this.retryAt) return;
    this.syncing = true;
    try {
      const queued = await offlineQueueService.getAll(50, driverId);
      if (this.driverId !== driverId) return;
      this.state.queuedCount = await offlineQueueService.getCount(driverId);
      if (this.driverId !== driverId) return;
      if (!navigator.onLine || this.state.isSimulatedOffline) {
        this.state.networkStatus = queued.length ? 'LOCATION_QUEUED' : 'NETWORK_OFFLINE';
        return;
      }
      if (!queued.length) return;

      const tripId = queued[0].tripId;
      const batch = queued.filter(item => item.tripId === tripId);
      this.state.networkStatus = 'SYNCING';
      this.notify();
      const result = await telemetryV1.sendBatch(tripId, batch.map(toEvent));
      const matched = new Set(result.results.flatMap(item => item.eventId ? [item.eventId] : []));
      await offlineQueueService.remove(batch.filter(item => matched.has(item.id)).map(item => item.id));
      if (this.driverId !== driverId) return;
      this.failures = 0;
      this.state.queuedCount = await offlineQueueService.getCount(driverId);
      this.state.networkStatus = 'NETWORK_ONLINE';
      if (result.results.some(item => item.status !== 'rejected')) this.state.lastSyncTime = new Date().toISOString();
      if (result.results.some(item => item.status === 'rejected')) this.state.errorMessage = 'The server rejected some location readings.';
    } catch {
      if (this.driverId !== driverId) return;
      this.retryAt = Date.now() + Math.min(60_000, 4000 * (2 ** this.failures++));
      this.state.networkStatus = 'LOCATION_QUEUED';
      this.state.errorMessage = 'Location records are queued. The app will retry when the connection is available.';
    } finally {
      this.syncing = false;
      this.notify();
    }
  }

  private networkChanged() {
    this.retryAt = 0;
    this.failures = 0;
    this.state.networkStatus = navigator.onLine && !this.state.isSimulatedOffline ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE';
    this.notify();
    void this.attemptSyncQueuedLocations();
  }

  private notify() {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const locationService = new LocationService();
