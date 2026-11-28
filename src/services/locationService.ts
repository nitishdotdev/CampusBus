import type { GPSStatus, NetworkStatus, LocationPoint, QueuedLocationUpdate } from '../types';
import { offlineQueueService } from './offlineQueue';
import { telemetryV1 } from './v1/telemetry';
import { applySyncVerdicts, type AcceptedFix, type ReadingVerdict, type SyncResultLike } from './gpsQuality';
import { describeSyncPause } from './telemetrySyncPolicy';
import {
  createSyncPolicyState, runSyncPass, type SyncPassOutcome, type SyncPolicyState,
} from './telemetrySyncPass';

/**
 * Sync phase, as the driver should understand it. Derived from the queue, the network and the sync policy.
 * - IDLE:           nothing waiting, or everything is in sync.
 * - SYNCING:        a batch is in flight.
 * - OFFLINE:        the device has no connection; readings are saved locally.
 * - WAITING_RETRY:  temporary failure; will retry at retryAt.
 * - PAUSED_AUTH:    the session must be renewed by signing in again.
 * - PAUSED_ACCOUNT: the account cannot send telemetry; sync stays paused until sign-in.
 */
export type SyncPhase = 'IDLE' | 'SYNCING' | 'OFFLINE' | 'WAITING_RETRY' | 'PAUSED_AUTH' | 'PAUSED_ACCOUNT';

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
  /** Last reading the server confirmed as live. Unreliable readings never replace it. */
  lastAcceptedLive: AcceptedFix | null;
  /** Server verdict for the newest reading that has been synced. */
  lastVerdict: ReadingVerdict | null;
  /** Session counts of rejected readings, keyed by server reason code. */
  rejectionCounts: Record<string, number>;
  /** Driver-facing sync phase (see SyncPhase). */
  syncPhase: SyncPhase;
  /** Readings kept on this device because the server refused their trip permanently. */
  quarantinedCount: number;
  /** When the device will try again, as ISO time, during WAITING_RETRY or PAUSED_AUTH. */
  retryAt: string | null;
  /** Short, driver-facing explanation for the current non-idle phase. */
  syncMessage: string | null;
}

const PRUNE_INTERVAL_MS = 10 * 60_000;
const QUARANTINE_MESSAGE = 'Some saved location readings could not be delivered and are kept on this device for up to 7 days. Contact campus transport if this continues.';

const toEvent = (item: QueuedLocationUpdate) => ({
  eventId: item.id, lat: item.lat, lng: item.lng, accuracyM: item.accuracy,
  speedMps: item.speed ?? undefined, headingDeg: item.heading ?? undefined, capturedAt: item.timestamp,
});

class LocationService {
  private watchId: number | null = null;
  private generation = 0;
  private syncing = false;
  private driverEpoch = 0;
  private pendingQuarantinePurges = new Set<string>();
  private listeners = new Set<(state: LocationServiceState) => void>();
  private reportingInterval = 3000;
  private driverId: string | null = null;

  /** Sync policy state for the current driver. Replaced whenever the driver changes. */
  private policy: SyncPolicyState = createSyncPolicyState();
  private lastPruneAt = 0;

  private state: LocationServiceState = {
    gpsStatus: 'GPS_PERMISSION_REQUIRED',
    networkStatus: navigator.onLine ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
    isTracking: false, isSimulated: false, lastLocation: null, lastSyncTime: null,
    queuedCount: 0, errorMessage: null, isSimulatedOffline: false,
    lastAcceptedLive: null, lastVerdict: null, rejectionCounts: {},
    syncPhase: 'IDLE', quarantinedCount: 0, retryAt: null, syncMessage: null,
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
      if (!this.syncing) this.purgeDepartedDriverQuarantine();
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
    if (this.driverId) this.pendingQuarantinePurges.add(this.driverId);
    this.driverEpoch++;
    this.stopTracking();
    this.driverId = driverId;
    if (!this.syncing) this.purgeDepartedDriverQuarantine();
    this.state.queuedCount = 0;
    this.state.quarantinedCount = 0;
    this.state.isSimulatedOffline = false;
    this.policy = createSyncPolicyState();
    this.state.errorMessage = null;
    this.networkChanged();
    if (driverId) void this.pruneOwnQuarantine();
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
    this.state.lastAcceptedLive = null;
    this.state.lastVerdict = null;
    this.notify();
  }

  /**
   * Starts one sync pass for the current driver. The policy lives in runSyncPass; this method only wires the real
   * queue and transport, guards against overlapping passes, and turns the outcome into driver-facing state.
   */
  public async attemptSyncQueuedLocations(): Promise<void> {
    const driverId = this.driverId;
    const epoch = this.driverEpoch;
    if (!driverId || this.syncing) return;
    if (this.policy.devicePause || Date.now() < this.policy.deviceRetryAt) {
      this.refreshPhase();
      return;
    }
    if (!navigator.onLine || this.state.isSimulatedOffline) {
      this.refreshPhase();
      return;
    }

    this.syncing = true;
    this.state.syncPhase = 'SYNCING';
    this.notify();
    try {
      const outcome = await runSyncPass({
        driverId,
        queue: offlineQueueService,
        transport: telemetryV1,
        state: this.policy,
        now: () => Date.now(),
        isCurrent: () => this.driverEpoch === epoch,
        onResults: (results, readings) => this.recordVerdicts(results, readings),
        toEvent,
      });
      if (this.driverEpoch !== epoch) return;
      this.applyOutcome(outcome);
    } finally {
      this.syncing = false;
      this.purgeDepartedDriverQuarantine();
      if (this.driverEpoch === epoch) await this.refreshCounts(driverId);
      this.notify();
    }
  }

  private applyOutcome(outcome: SyncPassOutcome): void {
    if (outcome.batchesSent > 0) this.state.lastSyncTime = new Date().toISOString();
    if (outcome.deviceFailure) {
      this.state.errorMessage = describeSyncPause(outcome.deviceFailure.reason);
    } else if (outcome.quarantinedTrips.length > 0) {
      this.state.errorMessage = QUARANTINE_MESSAGE;
    } else if (outcome.serverRejected) {
      this.state.errorMessage = 'The server rejected some location readings.';
    } else {
      this.state.errorMessage = null;
    }
  }

  /** Recomputes the driver-facing phase from the current queue, network and policy state. */
  private refreshPhase(): void {
    void this.refreshCounts(this.driverId);
  }

  private computePhase(): Pick<LocationServiceState, 'syncPhase' | 'retryAt' | 'syncMessage'> {
    if (this.policy.devicePause === 'ACCOUNT') {
      return { syncPhase: 'PAUSED_ACCOUNT', retryAt: null, syncMessage: describeSyncPause('ACCOUNT') };
    }
    if (this.policy.deviceRetryAt > Date.now() && this.policy.deviceRetryReason) {
      const retryAt = new Date(this.policy.deviceRetryAt).toISOString();
      if (this.policy.deviceRetryReason === 'AUTH') {
        return { syncPhase: 'PAUSED_AUTH', retryAt, syncMessage: describeSyncPause('AUTH') };
      }
      return { syncPhase: 'WAITING_RETRY', retryAt, syncMessage: describeSyncPause(this.policy.deviceRetryReason) };
    }
    if (!navigator.onLine || this.state.isSimulatedOffline) {
      return { syncPhase: 'OFFLINE', retryAt: null, syncMessage: describeSyncPause('NETWORK') };
    }
    return { syncPhase: 'IDLE', retryAt: null, syncMessage: null };
  }

  private async refreshCounts(driverId: string | null): Promise<void> {
    if (!driverId) return;
    const [queued, quarantined] = await Promise.all([
      offlineQueueService.countQueued(driverId),
      offlineQueueService.countQuarantined(driverId),
    ]);
    if (this.driverId !== driverId) return;
    this.state.queuedCount = queued;
    this.state.quarantinedCount = quarantined;
    Object.assign(this.state, this.computePhase());
    this.notify();
  }

  private purgeDepartedDriverQuarantine() {
    for (const driverId of this.pendingQuarantinePurges) {
      this.pendingQuarantinePurges.delete(driverId);
      void offlineQueueService.purgeQuarantine(driverId)
        .catch(() => { this.pendingQuarantinePurges.add(driverId); });
    }
  }

  private async pruneOwnQuarantine(): Promise<void> {
    if (Date.now() - this.lastPruneAt < PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = Date.now();
    await offlineQueueService.pruneQuarantine().catch(() => { this.lastPruneAt = 0; });
  }

  /** Applies the server's per-reading verdicts to the driver-visible state. */
  private recordVerdicts(results: SyncResultLike[], batch: QueuedLocationUpdate[]) {
    const next = applySyncVerdicts(this.state, results, batch.map(item => ({
      id: item.id, lat: item.lat, lng: item.lng, accuracy: item.accuracy, timestamp: item.timestamp,
    })));
    this.state.lastAcceptedLive = next.lastAcceptedLive;
    this.state.lastVerdict = next.lastVerdict;
    this.state.rejectionCounts = next.rejectionCounts;
  }

  private networkChanged() {
    if (this.policy.deviceRetryReason === 'NETWORK') {
      this.policy.deviceFailures = 0;
      this.policy.deviceRetryAt = 0;
      this.policy.deviceRetryReason = null;
    }
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
