// IndexedDB store for the driver's offline GPS telemetry.
//
// Two object stores:
// - telemetry_queue: readings waiting to be sent. Removed once the server has answered for them.
// - telemetry_quarantine: readings from a trip the server refused permanently (for example, the trip ended beyond
//   the late-sync window). Kept for a bounded period so the driver can see them, then pruned. They are never sent
//   again automatically, so they cannot block other trips.
//
// Schema history: v1 had telemetry_queue only. v2 adds telemetry_quarantine and keeps existing queue records
// (upgrades only create missing stores).

import { QueuedLocationUpdate } from '../types';
import { QUARANTINE_MAX_PER_DEVICE, QUARANTINE_RETENTION_MS } from './telemetrySyncPolicy';

const DB_NAME = 'smart_campus_bus_offline_db';
const DB_VERSION = 3;
const STORE_NAME = 'telemetry_queue';
const DRIVER_TIMESTAMP = 'driver_timestamp';
const driverRange = (id: string) => IDBKeyRange.bound([id], [id, []], false, true);
const QUARANTINE_STORE = 'telemetry_quarantine';
const LEGACY_STORAGE_KEY = 'smart_campus_bus_location_queue';

export interface QuarantinedLocationUpdate extends Pick<QueuedLocationUpdate, 'id' | 'driverId' | 'tripId'> {
  quarantinedAt: string;
  quarantineReason: string;
}

const reqPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

class OfflineQueueService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: QueuedLocationUpdate[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initIndexedDb().catch(() => { /* handled per operation via the memory fallback */ });
    }
  }

  private initIndexedDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
          const queue = req.transaction!.objectStore(STORE_NAME);
          if (!queue.indexNames.contains(DRIVER_TIMESTAMP)) queue.createIndex(DRIVER_TIMESTAMP, ['driverId', 'timestamp']);
          if (!db.objectStoreNames.contains(QUARANTINE_STORE)) {
            const quarantine = db.createObjectStore(QUARANTINE_STORE, { keyPath: 'id' });
            quarantine.createIndex('driverId', 'driverId', { unique: false });
            quarantine.createIndex('quarantinedAt', 'quarantinedAt', { unique: false });
          }
        };

        let blocked = false;
        req.onblocked = () => {
          blocked = true;
          reject(new Error('Close older CampusBus tabs to finish upgrading offline storage.'));
        };
        req.onsuccess = async () => {
          const db = req.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); this.dbPromise = null; };
          await this.migrateLegacyLocalStorage(db);
          resolve(db);
        };

        req.onerror = () => {
          console.warn('IndexedDB open error, falling back to memory:', req.error);
          reject(req.error);
        };
      } catch (err) {
        console.warn('IndexedDB unavailable:', err);
        reject(err);
      }
    });

    this.dbPromise = this.dbPromise.catch(error => {
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }

  private async migrateLegacyLocalStorage(db: IDBDatabase): Promise<void> {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of parsed) {
          if (item && item.id) store.put(item);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to migrate legacy localStorage queue:', err);
    }
  }

  public async enqueue(item: QueuedLocationUpdate): Promise<void> {
    try {
      const db = await this.initIndexedDb();
      return await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      const existingIdx = this.memoryFallback.findIndex((m) => m.id === item.id);
      if (existingIdx >= 0) this.memoryFallback[existingIdx] = item;
      else this.memoryFallback.push(item);
    }
  }

  /**
   * Returns up to `limit` queued readings for one driver, oldest first, skipping trips in `excludeTripIds`.
   * Trips that are backing off or quarantined are excluded here, so one blocked trip cannot hold back the others.
   * Scans the timestamp index and stops once `limit` readings are collected.
   */
  public async getNextBatch(driverId: string, excludeTripIds: ReadonlySet<string>, limit = 50): Promise<QueuedLocationUpdate[]> {
    const memory = this.memoryFallback.filter(item => item.driverId === driverId && !excludeTripIds.has(item.tripId));
    try {
      const db = await this.initIndexedDb();
      const persisted = await new Promise<QueuedLocationUpdate[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const results: QueuedLocationUpdate[] = [];
        const req = tx.objectStore(STORE_NAME).index(DRIVER_TIMESTAMP).openCursor(driverRange(driverId));
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor || results.length >= limit) { resolve(results); return; }
          const value = cursor.value as QueuedLocationUpdate;
          if (!excludeTripIds.has(value.tripId)) results.push(value);
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
      return this.oldest([...new Map([...memory, ...persisted].map(item => [item.id, item])).values()], limit);
    } catch {
      return this.oldest(memory, limit);
    }
  }

  private oldest(items: QueuedLocationUpdate[], limit: number) {
    return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(0, limit);
  }

  /** Counts queued readings for one driver without loading them. */
  public async countQueued(driverId: string): Promise<number> {
    try {
      const db = await this.initIndexedDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const persisted = await reqPromise(tx.objectStore(STORE_NAME).index(DRIVER_TIMESTAMP).count(driverRange(driverId)));
      return persisted + this.memoryFallback.filter(item => item.driverId === driverId).length;
    } catch {
      return this.memoryFallback.filter(item => item.driverId === driverId).length;
    }
  }

  public async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    this.memoryFallback = this.memoryFallback.filter(item => !idSet.has(item.id));
    try {
      const db = await this.initIndexedDb();
      return await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of ids) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      // Persisted readings remain eligible for deduplicated resend.
    }
  }

  /**
   * Moves every queued reading for one driver's trip into quarantine, atomically. Readings belonging to any other
   * driver or trip are not touched. Returns the number of readings moved.
   */
  public async quarantineTrip(driverId: string, tripId: string, reason: string, now: Date = new Date()): Promise<number> {
    try {
      const db = await this.initIndexedDb();
      const memory = this.memoryFallback.filter(item => item.driverId === driverId && item.tripId === tripId);
      const moved = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, QUARANTINE_STORE], 'readwrite');
        const queue = tx.objectStore(STORE_NAME);
        const quarantine = tx.objectStore(QUARANTINE_STORE);
        const moved = new Set<string>();
        const quarantineReading = ({ id, driverId, tripId }: QueuedLocationUpdate) => {
          const record: QuarantinedLocationUpdate = { id, driverId, tripId, quarantinedAt: now.toISOString(), quarantineReason: reason };
          quarantine.put(record);
          moved.add(id);
        };
        const req = queue.index(DRIVER_TIMESTAMP).openCursor(driverRange(driverId));
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) {
            memory.forEach(quarantineReading);
            this.pruneStore(quarantine, now);
            return;
          }
          const value = cursor.value as QueuedLocationUpdate;
          if (value.driverId === driverId && value.tripId === tripId) {
            quarantineReading(value);
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve(moved.size);
        tx.onabort = () => reject(tx.error);
      });
      const migrated = new Set(memory.map(item => item.id));
      this.memoryFallback = this.memoryFallback.filter(item => !migrated.has(item.id));
      return moved;
    } catch {
      return 0;
    }
  }

  public async countQuarantined(driverId: string): Promise<number> {
    try {
      const db = await this.initIndexedDb();
      const tx = db.transaction(QUARANTINE_STORE, 'readonly');
      return await reqPromise(tx.objectStore(QUARANTINE_STORE).index('driverId').count(IDBKeyRange.only(driverId)));
    } catch {
      return 0;
    }
  }

  private pruneStore(store: IDBObjectStore, now: Date) {
    const cutoff = now.getTime() - QUARANTINE_RETENTION_MS;
    const request = store.index('quarantinedAt').getAll();
    request.onsuccess = () => {
      const records = request.result as QuarantinedLocationUpdate[];
      records.forEach((record, index) => {
        if (Date.parse(record.quarantinedAt) < cutoff || index < records.length - QUARANTINE_MAX_PER_DEVICE) {
          store.delete(record.id);
        }
      });
    };
  }

  public async pruneQuarantine(now: Date = new Date()): Promise<void> {
    const db = await this.initIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUARANTINE_STORE, 'readwrite');
      this.pruneStore(tx.objectStore(QUARANTINE_STORE), now);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  }

  /** Removes all quarantined readings for one driver. Used at sign-out so one driver's data never remains for the next. */
  public async purgeQuarantine(driverId: string): Promise<void> {
    const db = await this.initIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUARANTINE_STORE, 'readwrite');
      const store = tx.objectStore(QUARANTINE_STORE);
      const request = store.index('driverId').getAllKeys(IDBKeyRange.only(driverId));
      request.onsuccess = () => { for (const key of request.result) store.delete(key); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  }

  public async clear(): Promise<void> {
    try {
      const db = await this.initIndexedDb();
      return await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      this.memoryFallback = [];
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
