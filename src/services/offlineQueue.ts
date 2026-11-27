// Robust IndexedDB implementation for driver's offline GPS telemetry queue
// Replaces localStorage to handle large batches without storage limits or UI thread blocking.

import { QueuedLocationUpdate } from '../types';

const DB_NAME = 'smart_campus_bus_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'telemetry_queue';
const LEGACY_STORAGE_KEY = 'smart_campus_bus_location_queue';

class OfflineQueueService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: QueuedLocationUpdate[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initIndexedDb();
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
        };

        req.onsuccess = async () => {
          const db = req.result;
          // One-time migration of any legacy localStorage items into IndexedDB
          await this.migrateLegacyLocalStorage(db);
          resolve(db);
        };

        req.onerror = () => {
          console.warn('IndexedDB open error, falling back to memory/local storage:', req.error);
          reject(req.error);
        };
      } catch (err) {
        console.warn('IndexedDB unavailable:', err);
        reject(err);
      }
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
          if (item && item.id) {
            store.put(item);
          }
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
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
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback
      const existingIdx = this.memoryFallback.findIndex((m) => m.id === item.id);
      if (existingIdx >= 0) {
        this.memoryFallback[existingIdx] = item;
      } else {
        this.memoryFallback.push(item);
      }
    }
  }

  public async getAll(limit = 200, driverId?: string): Promise<QueuedLocationUpdate[]> {
    try {
      const db = await this.initIndexedDb();
      return new Promise<QueuedLocationUpdate[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const results: QueuedLocationUpdate[] = [];

        const req = index.openCursor(null, 'next');
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && results.length < limit) {
            if (!driverId || cursor.value.driverId === driverId) results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback.filter(item => !driverId || item.driverId === driverId).slice(0, limit);
    }
  }

  public async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = await this.initIndexedDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of ids) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      const idSet = new Set(ids);
      this.memoryFallback = this.memoryFallback.filter((m) => !idSet.has(m.id));
    }
  }

  public async getCount(driverId?: string): Promise<number> {
    if (driverId) return (await this.getAll(Infinity, driverId)).length;
    try {
      const db = await this.initIndexedDb();
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback.length;
    }
  }

  public async clear(): Promise<void> {
    try {
      const db = await this.initIndexedDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      this.memoryFallback = [];
    }
  }

  public async incrementAttempts(ids: string[], maxAttempts = 15): Promise<string[]> {
    if (ids.length === 0) return [];
    const prunedIds: string[] = [];
    try {
      const db = await this.initIndexedDb();
      return new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of ids) {
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const item: QueuedLocationUpdate = getReq.result;
            if (item) {
              const count = (item.attemptCount || 0) + 1;
              if (count > maxAttempts) {
                store.delete(id);
                prunedIds.push(id);
              } else {
                item.attemptCount = count;
                store.put(item);
              }
            }
          };
        }
        tx.oncomplete = () => resolve(prunedIds);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      const idSet = new Set(ids);
      this.memoryFallback = this.memoryFallback.filter((item) => {
        if (idSet.has(item.id)) {
          const count = (item.attemptCount || 0) + 1;
          if (count > maxAttempts) {
            prunedIds.push(item.id);
            return false;
          }
          item.attemptCount = count;
        }
        return true;
      });
      return prunedIds;
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
