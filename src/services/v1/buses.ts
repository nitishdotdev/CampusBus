import { v1Client } from './client';

export interface V1Bus {
  id: string; campusId: string; number: string; capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';
  driverId?: string | null; routeId?: string | null;
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const busesV1 = {
  list: (page = 1, pageSize = 50) =>
    v1Client.get<Page<V1Bus>>(`/api/v1/buses?page=${page}&pageSize=${pageSize}`),

  get: (id: string) => v1Client.get<V1Bus>(`/api/v1/buses/${id}`),

  create: (body: { number: string; capacity: number; status?: string }) =>
    v1Client.post<V1Bus>('/api/v1/buses', body),

  update: (id: string, patch: Partial<{ number: string; capacity: number; status: string }>) =>
    v1Client.patch<V1Bus>(`/api/v1/buses/${id}`, patch),

  delete: (id: string) => v1Client.delete<void>(`/api/v1/buses/${id}`),

  assignDriver: (id: string, driverId: string | null) =>
    v1Client.post<V1Bus>(`/api/v1/buses/${id}/assign-driver`, { driverId }),

  assignRoute: (id: string, routeId: string | null) =>
    v1Client.post<V1Bus>(`/api/v1/buses/${id}/assign-route`, { routeId }),

  livePosition: (id: string) =>
    v1Client.get<unknown>(`/api/v1/buses/${id}/live`),
};
