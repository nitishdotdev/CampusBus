import { v1Client } from './client';

export type NotificationKind = 'ANNOUNCEMENT' | 'DELAY' | 'ROUTE_CHANGE' | 'EMERGENCY';
export type NotificationPriority = 'NORMAL' | 'HIGH' | 'URGENT';
export interface V1Notification {
  id: string; campusId: string; kind: NotificationKind; priority: NotificationPriority;
  title: string; body: string; routeId?: string | null; createdBy: string;
  expiresAt?: string | null; createdAt: string;
}

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export interface V1Alert {
  id: string; campusId: string; busId: string; tripId?: string | null;
  raisedBy: string; status: AlertStatus; message?: string | null;
  location?: { lat: number; lng: number } | null; createdAt: string;
  acknowledgedBy?: string | null; acknowledgedAt?: string | null;
  resolvedBy?: string | null; resolvedAt?: string | null;
}

export type ScheduleDirection = 'TO_CAMPUS' | 'FROM_CAMPUS';
export interface V1Schedule {
  id: string; campusId: string; routeId: string; busId: string;
  direction: ScheduleDirection; daysOfWeek: number[]; departTime: string; active: boolean;
}

interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

// ── Notifications ──────────────────────────────────────────────────────────────
export const notificationsV1 = {
  list: (routeId?: string, page = 1) => {
    const q = routeId ? `&routeId=${routeId}` : '';
    return v1Client.get<Page<V1Notification>>(`/api/v1/notifications?page=${page}${q}`);
  },
  broadcast: (body: {
    kind: NotificationKind; priority?: NotificationPriority;
    title: string; body: string; routeId?: string; expiresAt?: string;
  }) => v1Client.post<V1Notification>('/api/v1/notifications', body),
  delete: (id: string) => v1Client.delete<void>(`/api/v1/notifications/${id}`),
};

// ── Emergency alerts ──────────────────────────────────────────────────────────
export const alertsV1 = {
  list: (status?: AlertStatus, page = 1) => {
    const q = status ? `&status=${status}` : '';
    return v1Client.get<Page<V1Alert>>(`/api/v1/alerts?page=${page}${q}`);
  },
  raise: (body: { busId: string; tripId?: string; message?: string; location?: { lat: number; lng: number } }) =>
    v1Client.post<V1Alert>('/api/v1/alerts', body),
  acknowledge: (id: string) => v1Client.post<V1Alert>(`/api/v1/alerts/${id}/acknowledge`, {}),
  resolve: (id: string)      => v1Client.post<V1Alert>(`/api/v1/alerts/${id}/resolve`, {}),
};

// ── Schedules ──────────────────────────────────────────────────────────────────
export const schedulesV1 = {
  list: (routeId?: string, day?: number, active?: boolean, page = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (routeId !== undefined) params.set('routeId', routeId);
    if (day !== undefined) params.set('day', String(day));
    if (active !== undefined) params.set('active', String(active));
    return v1Client.get<Page<V1Schedule>>(`/api/v1/schedules?${params}`);
  },
  create: (body: {
    routeId: string; busId: string; direction: ScheduleDirection;
    daysOfWeek: number[]; departTime: string; active?: boolean;
  }) => v1Client.post<V1Schedule>('/api/v1/schedules', body),
  update: (id: string, patch: Partial<{ direction: ScheduleDirection; daysOfWeek: number[]; departTime: string; active: boolean }>) =>
    v1Client.patch<V1Schedule>(`/api/v1/schedules/${id}`, patch),
  delete: (id: string) => v1Client.delete<void>(`/api/v1/schedules/${id}`),
};
