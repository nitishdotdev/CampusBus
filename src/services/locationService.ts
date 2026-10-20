import { GPSStatus, NetworkStatus, LocationPoint, QueuedLocationUpdate } from '../types';
import { apiClient } from './apiClient';
import { realtimeService } from './realtimeService';
import { offlineQueueService } from './offlineQueue';
import { telemetryV1 } from './v1/telemetry';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

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

type StateListener = (state: LocationServiceState) => void;

class LocationService {
  private watchId: number | null = null;
  private simulationInterval: number | null = null;
  private syncInterval: number | null = null;
  private isSyncing = false;
  private consecutiveFailures = 0;
  private listeners: StateListener[] = [];

  private currentTripId: string | null = null;
  private currentBusId: string | null = null;
  private currentDriverId: string | null = null;

  private state: LocationServiceState = {
    gpsStatus: 'GPS_PERMISSION_REQUIRED',
    networkStatus: navigator.onLine ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
    isTracking: false,
    isSimulated: false,
    lastLocation: null,
    lastSyncTime: null,
    queuedCount: 0,
    errorMessage: null,
    isSimulatedOffline: false,
  };

  constructor() {
    this.refreshQueuedCount();

    // Listen to real browser online/offline events
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Periodic sync attempt for queued items every 4 seconds
    this.syncInterval = window.setInterval(() => {
      this.attemptSyncQueuedLocations();
    }, 4000);
  }

  public getState(): LocationServiceState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public toggleSimulatedOffline(simulateOffline: boolean): void {
    if (import.meta.env.PROD) {
      console.warn('Network simulation is disabled in production mode.');
      return;
    }

    this.state.isSimulatedOffline = simulateOffline;
    if (simulateOffline) {
      this.state.networkStatus = 'NETWORK_OFFLINE';
    } else {
      this.state.networkStatus = navigator.onLine ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE';
      if (this.state.networkStatus === 'NETWORK_ONLINE') {
        this.attemptSyncQueuedLocations();
      }
    }
    this.notify();
  }

  public async startTracking(
    tripId: string,
    busId: string,
    driverId: string,
    useSimulation = false
  ): Promise<boolean> {
    this.currentTripId = tripId;
    this.currentBusId = busId;
    this.currentDriverId = driverId;
    this.state.isTracking = true;

    // Production strictly enforces real browser GPS
    const isProduction = import.meta.env.PROD;
    const effectiveSimulation = isProduction ? false : useSimulation;
    this.state.isSimulated = effectiveSimulation;
    this.state.gpsStatus = 'GPS_SEARCHING';
    this.state.errorMessage = null;
    this.notify();

    if (effectiveSimulation) {
      this.startSimulatedTracking();
      return true;
    }

    if (!('geolocation' in navigator)) {
      this.state.gpsStatus = 'GPS_UNAVAILABLE';
      this.state.errorMessage = 'Geolocation API is not supported on this browser or device.';
      this.notify();
      return false;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.handlePositionUpdate({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: new Date(position.timestamp).toISOString(),
          });
        },
        (error) => {
          console.warn('Geolocation sensor notice:', error);
          if (error.code === error.PERMISSION_DENIED) {
            this.state.gpsStatus = 'GPS_PERMISSION_REQUIRED';
            this.state.errorMessage = 'Location permission was denied. Please allow access in browser settings.';
          } else {
            this.state.gpsStatus = 'GPS_UNAVAILABLE';
            this.state.errorMessage = error.message || 'Unable to retrieve location signal.';
          }
          this.notify();
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 3000,
        }
      );
      return true;
    } catch (err: unknown) {
      this.state.gpsStatus = 'GPS_UNAVAILABLE';
      this.state.errorMessage = (err as Error).message || 'Failed to start GPS tracking.';
      this.notify();
      return false;
    }
  }

  public stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.simulationInterval !== null) {
      window.clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    this.state.isTracking = false;
    this.state.gpsStatus = 'GPS_PERMISSION_REQUIRED';
    this.currentTripId = null;
    this.notify();
  }

  private async handlePositionUpdate(loc: LocationPoint): Promise<void> {
    this.state.gpsStatus = 'GPS_ACTIVE';
    this.state.lastLocation = loc;

    const isOffline = this.state.isSimulatedOffline || !navigator.onLine;

    const pointId = 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    if (isOffline) {
      // Queue location offline in local storage
      this.queueLocationOffline(loc, pointId);
      this.state.networkStatus = 'LOCATION_QUEUED';
      this.notify();
      return;
    }

    // Attempt direct real-time broadcast to backend API
    try {
      if (this.currentBusId) {
        if (USE_V1 && this.currentTripId) {
          await telemetryV1.send({
            eventId: pointId,
            tripId: this.currentTripId,
            busId: this.currentBusId,
            location: { lat: loc.lat, lng: loc.lng },
            accuracyM: loc.accuracy ?? null,
            speedMps: loc.speed ?? null,
            headingDeg: loc.heading ?? null,
            capturedAt: new Date(loc.timestamp).toISOString(),
          });
        } else {
          await apiClient.post('/api/driver/location', {
            id: pointId,
            tripId: this.currentTripId,
            busId: this.currentBusId,
            lat: loc.lat,
            lng: loc.lng,
            speed: loc.speed,
            heading: loc.heading,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp,
            isSimulated: this.state.isSimulated,
          });
        }
        this.state.networkStatus = 'NETWORK_ONLINE';
        this.state.lastSyncTime = new Date().toISOString();
      }
    } catch (err) {
      // Network error occurred during transmission -> queue offline
      console.warn('Network transmission failed, queuing location offline:', err);
      this.queueLocationOffline(loc, pointId);
      this.state.networkStatus = 'LOCATION_QUEUED';
    }

    this.notify();
  }

  private async queueLocationOffline(loc: LocationPoint, assignedId?: string): Promise<void> {
    if (!this.currentTripId || !this.currentBusId || !this.currentDriverId) return;

    const pointId = assignedId || ('loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));

    const item: QueuedLocationUpdate = {
      id: pointId,
      tripId: this.currentTripId,
      busId: this.currentBusId,
      driverId: this.currentDriverId,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      speed: loc.speed,
      heading: loc.heading,
      timestamp: loc.timestamp,
      attemptCount: 0,
    };

    await offlineQueueService.enqueue(item);
    this.state.queuedCount = await offlineQueueService.getCount();
    this.notify();
  }

  public async attemptSyncQueuedLocations(): Promise<void> {
    if (this.isSyncing) return;
    if (this.consecutiveFailures >= 5) {
      // Pause automatic polling if server endpoint is continuously failing
      return;
    }

    const queuedItems = await offlineQueueService.getAll(100);
    if (queuedItems.length === 0) {
      this.state.queuedCount = 0;
      this.state.errorMessage = null;
      this.consecutiveFailures = 0;
      return;
    }

    const isOffline = this.state.isSimulatedOffline || !navigator.onLine;
    if (isOffline) {
      this.state.networkStatus = 'LOCATION_QUEUED';
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.state.networkStatus = 'SYNCING';
    this.notify();

    try {
      const busId = this.currentBusId || queuedItems[0].busId;
      const tripId = this.currentTripId || queuedItems[0].tripId;

      let syncRes: any;
      if (USE_V1) {
        syncRes = await telemetryV1.sendBatch(
          queuedItems.map((q) => ({
            eventId: q.id,
            tripId: q.tripId || tripId,
            busId: q.busId || busId,
            location: { lat: q.lat, lng: q.lng },
            accuracyM: q.accuracy ?? null,
            speedMps: q.speed ?? null,
            headingDeg: q.heading ?? null,
            capturedAt: new Date(q.timestamp).toISOString(),
          }))
        );
        // v1 returns { accepted, rejected, errors } — treat all non-rejected as saved
        if (syncRes?.rejected === 0) {
          await offlineQueueService.remove(queuedItems.map((q) => q.id));
        }
      } else {
        syncRes = await apiClient.post<any>('/api/driver/location/sync', {
          tripId,
          busId,
          locations: queuedItems,
        });
      }

      // Clear only successfully synced batch from IndexedDB
      if (syncRes && Array.isArray(syncRes.savedIds) && syncRes.savedIds.length > 0) {
        await offlineQueueService.remove(syncRes.savedIds);
      } else if (syncRes && (!syncRes.failedIndices || syncRes.failedIndices.length === 0)) {
        await offlineQueueService.remove(queuedItems.map((q) => q.id));
      }
      this.consecutiveFailures = 0;
      this.state.queuedCount = await offlineQueueService.getCount();
      this.state.networkStatus = 'NETWORK_ONLINE';
      this.state.lastSyncTime = new Date().toISOString();
      this.state.errorMessage = null;
    } catch (err: any) {
      this.consecutiveFailures++;

      if (err.status === 405 || err.status === 404) {
        console.warn(`Telemetry sync endpoint returned HTTP ${err.status}. Pausing retry.`);
        await offlineQueueService.incrementAttempts(queuedItems.map((q) => q.id));
      } else {
        console.warn('Sync queued locations error:', err);
      }

      this.state.networkStatus = 'LOCATION_QUEUED';
      this.state.errorMessage = `Telemetry sync warning: ${err.message || 'Transmission failed, retrying shortly.'}`;

      // Handle server validation error (e.g., corrupt location data)
      if (err.status === 400 && typeof err.data?.failedIndex === 'number') {
        const badItem = queuedItems[err.data.failedIndex];
        if (badItem) {
          console.warn('Pruning unrecoverable location record from queue:', badItem.id);
          await offlineQueueService.remove([badItem.id]);
        }
      } else if (err.status !== 405 && err.status !== 404) {
        await offlineQueueService.incrementAttempts(queuedItems.map((q) => q.id));
      }

      this.state.queuedCount = await offlineQueueService.getCount();
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  private handleNetworkChange(isOnline: boolean): void {
    if (this.state.isSimulatedOffline) return;

    if (isOnline) {
      this.consecutiveFailures = 0;
      this.state.networkStatus = 'NETWORK_ONLINE';
      this.attemptSyncQueuedLocations();
    } else {
      this.state.networkStatus = 'NETWORK_OFFLINE';
    }
    this.notify();
  }

  private async refreshQueuedCount(): Promise<void> {
    try {
      this.state.queuedCount = await offlineQueueService.getCount();
      this.notify();
    } catch {
      this.state.queuedCount = 0;
    }
  }

  // Development-only waypoint simulation
  private startSimulatedTracking(): void {
    if (this.simulationInterval) return;

    const waypoints: [number, number][] = [
      [34.0537, -118.2570],
      [34.0548, -118.2562],
      [34.0562, -118.2555],
      [34.0575, -118.2572],
      [34.0582, -118.2595],
      [34.0571, -118.2618],
      [34.0552, -118.2625],
      [34.0535, -118.2608],
      [34.0528, -118.2588],
    ];
    let wpIdx = 0;

    this.simulationInterval = window.setInterval(() => {
      const [lat, lng] = waypoints[wpIdx % waypoints.length];
      const nextWp = waypoints[(wpIdx + 1) % waypoints.length];
      const heading = Math.round(
        (Math.atan2(nextWp[1] - lng, nextWp[0] - lat) * 180) / Math.PI + 360
      ) % 360;

      this.handlePositionUpdate({
        lat,
        lng,
        accuracy: 4,
        speed: 7.2, // ~26 km/h
        heading,
        timestamp: new Date().toISOString(),
      });

      wpIdx++;
    }, 3500);
  }

  private notify(): void {
    this.listeners.forEach((l) => l({ ...this.state }));
  }
}

export const locationService = new LocationService();
