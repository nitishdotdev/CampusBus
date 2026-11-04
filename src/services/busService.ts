import { Bus, BusStatus } from '../types';
import { apiClient } from './apiClient';
import { realtimeService } from './realtimeService';
import { busesV1 } from './v1/buses';
import { v1BusToUi } from './v1/adapters';

import { isV1Api } from './v1/flag';

const USE_V1 = isV1Api();

function toV1Status(status?: BusStatus): 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE' {
  if (status === 'MAINTENANCE') return 'MAINTENANCE';
  if (status === 'OFFLINE') return 'OFFLINE';
  return 'ACTIVE';
}

class BusService {
  public async getBuses(): Promise<Bus[]> {
    return realtimeService.fetchBusesFromApi();
  }

  public async getBusById(id: string): Promise<Bus | undefined> {
    try {
      if (USE_V1) return v1BusToUi(await busesV1.get(id));
      return await apiClient.get<Bus>(`/api/buses/${id}`);
    } catch {
      return realtimeService.getBusById(id);
    }
  }

  public async createBus(busData: Omit<Bus, 'id' | 'lastLocation' | 'lastSyncTimestamp'>): Promise<Bus> {
    if (USE_V1) {
      const created = v1BusToUi(await busesV1.create({
        number: busData.busNumber,
        capacity: busData.capacity,
        status: toV1Status(busData.status),
      }));
      if (busData.currentRouteId) {
        const assigned = v1BusToUi(await busesV1.assignRoute(created.id, busData.currentRouteId));
        const current = realtimeService.getBuses();
        realtimeService.setBuses([assigned, ...current]);
        return assigned;
      }
      const current = realtimeService.getBuses();
      realtimeService.setBuses([created, ...current]);
      return created;
    }
    const newBus = await apiClient.post<Bus>('/api/buses', {
      busNumber: busData.busNumber,
      plateNumber: busData.plateNumber,
      capacity: busData.capacity,
      model: busData.model,
      currentRouteId: busData.currentRouteId,
      status: busData.status,
    });

    const current = realtimeService.getBuses();
    realtimeService.setBuses([newBus, ...current]);
    return newBus;
  }

  public async updateBus(id: string, updates: Partial<Bus>): Promise<Bus | undefined> {
    try {
      if (USE_V1) {
        const patch: { number?: string; capacity?: number; status?: string } = {};
        if (updates.busNumber) patch.number = updates.busNumber;
        if (updates.capacity != null) patch.capacity = updates.capacity;
        if (updates.status) patch.status = toV1Status(updates.status);
        const updated = v1BusToUi(await busesV1.update(id, patch));
        const current = realtimeService.getBuses();
        realtimeService.setBuses(current.map((b) => (b.id === id ? { ...b, ...updated } : b)));
        return updated;
      }
      const updated = await apiClient.put<Bus>(`/api/buses/${id}`, updates);
      const current = realtimeService.getBuses();
      realtimeService.setBuses(current.map((b) => (b.id === id ? { ...b, ...updated } : b)));
      return updated;
    } catch (err) {
      if (USE_V1) throw err;
      console.warn('Backend update bus error:', err);
      const current = realtimeService.getBuses();
      let updated: Bus | undefined;
      const next = current.map((b) => {
        if (b.id === id) {
          updated = { ...b, ...updates };
          return updated;
        }
        return b;
      });
      realtimeService.setBuses(next);
      return updated;
    }
  }

  public async updateStatus(id: string, status: BusStatus): Promise<void> {
    await this.updateBus(id, { status });
  }

  public async deleteBus(id: string): Promise<boolean> {
    try {
      if (USE_V1) await busesV1.delete(id);
      else await apiClient.delete(`/api/buses/${id}`);
    } catch (err) {
      if (USE_V1) throw err;
      console.warn('Backend delete bus error:', err);
    }
    const current = realtimeService.getBuses();
    realtimeService.setBuses(current.filter((b) => b.id !== id));
    return true;
  }
}

export const busService = new BusService();
