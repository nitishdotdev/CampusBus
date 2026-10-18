import { v1Client } from './client';
import type { V1Role, V1Status } from './auth';

export interface V1User {
  id: string; campusId: string; email: string; name: string;
  role: V1Role; status: V1Status; emailVerifiedAt: string | null;
  assignedBusId?: string | null; assignedRouteId?: string | null;
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const adminV1 = {
  users: {
    list: (opts: { role?: V1Role; status?: V1Status; page?: number; pageSize?: number } = {}) => {
      const p = new URLSearchParams();
      if (opts.role) p.set('role', opts.role);
      if (opts.status) p.set('status', opts.status);
      if (opts.page) p.set('page', String(opts.page));
      if (opts.pageSize) p.set('pageSize', String(opts.pageSize));
      return v1Client.get<Page<V1User>>(`/api/v1/users?${p}`);
    },
    setStatus: (id: string, status: V1Status) =>
      v1Client.patch<void>(`/api/v1/users/${id}/status`, { status }),
    assignTransport: (id: string, busId: string | null, routeId: string | null) =>
      v1Client.post<void>(`/api/v1/users/${id}/assign-transport`, { busId, routeId }),
  },
};
