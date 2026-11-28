import { v1Client } from './client';

export interface V1Trip {
  id: string; campusId: string; busId: string; driverId: string; routeId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; mode: 'REAL' | 'SIMULATED';
  startedAt: string; endedAt?: string | null;
  currentOccupancy?: number | null; completedStopIds?: string[]; nextStopId?: string | null; totalLocationsLogged?: number;
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const tripsV1 = {
  get: (tripId: string) => v1Client.get<{ trip: V1Trip }>(`/api/v1/trips/${tripId}`),

  start: (busId: string) =>
    v1Client.post<{ trip: V1Trip }>('/api/v1/trips/start', { busId }),

  end: (tripId: string) =>
    v1Client.post<{ trip: V1Trip }>(`/api/v1/trips/${tripId}/end`, {}),

  updateOccupancy: (tripId: string, delta: number) =>
    v1Client.patch<{ trip: V1Trip }>(`/api/v1/trips/${tripId}/occupancy`, { delta }),

  list: (page = 1, pageSize = 20, status?: V1Trip['status']) =>
    v1Client.get<Page<V1Trip>>(`/api/v1/trips?page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ''}`),
};
