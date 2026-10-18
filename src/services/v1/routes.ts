import { v1Client } from './client';

export interface V1Stop { id: string; name: string; lat: number; lng: number; order: number }
export interface V1Route {
  id: string; campusId: string; code: string; name: string;
  color: string; stops: V1Stop[];
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const routesV1 = {
  list: (page = 1, pageSize = 50) =>
    v1Client.get<Page<V1Route>>(`/api/v1/routes?page=${page}&pageSize=${pageSize}`),

  get: (id: string) => v1Client.get<V1Route>(`/api/v1/routes/${id}`),

  create: (body: { code: string; name: string; color?: string; stops?: V1Stop[] }) =>
    v1Client.post<V1Route>('/api/v1/routes', body),

  update: (id: string, patch: Partial<{ code: string; name: string; color: string; stops: V1Stop[] }>) =>
    v1Client.patch<V1Route>(`/api/v1/routes/${id}`, patch),

  delete: (id: string) => v1Client.delete<void>(`/api/v1/routes/${id}`),
};
