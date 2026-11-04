import { CampusNotification, NotificationCategory, NotificationPriority } from '../types';
import { apiClient } from './apiClient';
import { socketService } from './socketService';
import { notificationsV1, type NotificationKind, type NotificationPriority as V1Priority } from './v1/notifications';
import { v1NotificationToUi } from './v1/adapters';

import { isV1Api } from './v1/flag';

const USE_V1 = isV1Api();

function toV1Kind(category: NotificationCategory): NotificationKind {
  if (category === 'DELAY') return 'DELAY';
  if (category === 'ROUTE_CHANGE') return 'ROUTE_CHANGE';
  if (category === 'EMERGENCY' || category === 'CANCELLATION') return 'EMERGENCY';
  return 'ANNOUNCEMENT';
}

function toV1Priority(priority: NotificationPriority): V1Priority {
  if (priority === 'EMERGENCY') return 'URGENT';
  if (priority === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

class NotificationService {
  private notifications: CampusNotification[] = [];
  private listeners: ((items: CampusNotification[]) => void)[] = [];

  constructor() {
    if (!USE_V1) this.fetchNotificationsFromApi();
    socketService.on('notification:new', (notif: CampusNotification) => {
      this.notifications.unshift(notif);
      this.notify();
    });
  }

  public async fetchNotificationsFromApi(): Promise<CampusNotification[]> {
    try {
      if (USE_V1) {
        const page = await notificationsV1.list(undefined, 1);
        this.notifications = page.items.map(v1NotificationToUi);
        this.notify();
        return this.notifications;
      }
      const data = await apiClient.get<CampusNotification[]>('/api/notifications');
      if (Array.isArray(data)) this.notifications = data;
      this.notify();
    } catch { /* empty state */ }
    return this.notifications;
  }

  public getNotifications(): CampusNotification[] { return [...this.notifications]; }

  public subscribe(listener: (items: CampusNotification[]) => void): () => void {
    this.listeners.push(listener); listener(this.notifications);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  public async markAsRead(id: string): Promise<void> {
    if (!USE_V1) {
      try { await apiClient.put(`/api/notifications/${id}/read`); } catch { /* offline */ }
    }
    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    this.notify();
  }

  public async markAllAsRead(): Promise<void> {
    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
    this.notify();
  }

  public async createNotification(data: {
    collegeId: string; title: string; message: string;
    category: NotificationCategory; priority: NotificationPriority;
    routeId?: string; busId?: string;
  }): Promise<CampusNotification> {
    if (USE_V1) {
      const created = v1NotificationToUi(await notificationsV1.broadcast({
        kind: toV1Kind(data.category),
        priority: toV1Priority(data.priority),
        title: data.title,
        body: data.message,
        routeId: data.routeId,
      }));
      this.notifications.unshift(created); this.notify(); return created;
    }
    const res = await apiClient.post<CampusNotification>('/api/notifications/broadcast', data);
    this.notifications.unshift(res); this.notify(); return res;
  }

  private notify(): void { this.listeners.forEach((l) => l(this.notifications)); }
}
export const notificationService = new NotificationService();
