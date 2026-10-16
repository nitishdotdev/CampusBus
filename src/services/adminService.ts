import { EmergencyAlert, FleetStats, Driver, Student, Bus, BusStatus, Route, NotificationCategory, NotificationPriority } from '../types';
import { apiClient } from './apiClient';
import { socketService } from './socketService';
import { realtimeService } from './realtimeService';
import { busService } from './busService';
import { routeService } from './routeService';
import { notificationService } from './notificationService';

class AdminService {
  private alerts: EmergencyAlert[] = [];
  private alertListeners: ((alerts: EmergencyAlert[]) => void)[] = [];

  constructor() {
    this.fetchAlertsFromApi();

    socketService.on('emergency:alert', (alert: EmergencyAlert) => {
      this.alerts.unshift(alert);
      this.notifyAlerts();
    });

    socketService.on('emergency:admin_alert', (alert: EmergencyAlert) => {
      this.alerts.unshift(alert);
      this.notifyAlerts();
    });

    socketService.on('emergency:status', (updated: EmergencyAlert) => {
      this.alerts = this.alerts.map((a) => (a.id === updated.id ? { ...a, ...updated } : a));
      this.notifyAlerts();
    });
  }

  public async fetchAlertsFromApi(): Promise<EmergencyAlert[]> {
    try {
      const data = await apiClient.get<EmergencyAlert[]>('/api/alerts');
      if (Array.isArray(data)) {
        this.alerts = data;
        this.notifyAlerts();
        return this.alerts;
      }
    } catch {
      // Offline fallback - use empty state
    }
    return this.alerts;
  }

  public getEmergencyAlerts(): EmergencyAlert[] {
    return [...this.alerts];
  }

  public subscribeAlerts(listener: (alerts: EmergencyAlert[]) => void): () => void {
    this.alertListeners.push(listener);
    listener(this.alerts);
    return () => {
      this.alertListeners = this.alertListeners.filter((l) => l !== listener);
    };
  }

  public async triggerEmergencyAlert(params: {
    collegeId?: string;
    tripId: string;
    busId: string;
    busNumber: string;
    driverId: string;
    driverName: string;
    routeId: string;
    routeName: string;
    location: { lat: number; lng: number; accuracy?: number };
    reason?: string;
  }): Promise<EmergencyAlert> {
    try {
      const res = await apiClient.post<{ success: boolean; alert: EmergencyAlert }>('/api/driver/emergency', {
        tripId: params.tripId,
        busId: params.busId,
        reason: params.reason || 'General Transit Emergency Protocol Triggered',
        lat: params.location.lat,
        lng: params.location.lng,
      });

      if (res.alert) {
        this.alerts.unshift(res.alert);
        this.notifyAlerts();
        return res.alert;
      }
    } catch (err) {
      console.warn('Backend emergency alert error:', err);
    }

    const fallbackAlert: EmergencyAlert = {
      id: 'alert_' + Date.now().toString(),
      collegeId: params.collegeId || 'college_apex',
      ...params,
      timestamp: new Date().toISOString(),
      status: 'ACTIVE',
      severity: 'CRITICAL',
    };

    this.alerts.unshift(fallbackAlert);
    this.notifyAlerts();
    realtimeService.broadcastEmergency(fallbackAlert);

    return fallbackAlert;
  }

  public async acknowledgeAlert(id: string, adminName: string): Promise<void> {
    try {
      await apiClient.put(`/api/alerts/${id}/acknowledge`, {
        notes: `Acknowledged by ${adminName} at Dispatch Desk`,
      });
    } catch (err) {
      console.warn('Acknowledge API error:', err);
    }

    this.alerts = this.alerts.map((a) =>
      a.id === id ? { ...a, status: 'ACKNOWLEDGED', acknowledgedBy: adminName } : a
    );
    this.notifyAlerts();
  }

  public async resolveAlert(id: string, notes?: string): Promise<void> {
    try {
      await apiClient.put(`/api/alerts/${id}/resolve`, {
        notes: notes || 'Incident resolved.',
      });
    } catch (err) {
      console.warn('Resolve API error:', err);
    }

    this.alerts = this.alerts.map((a) =>
      a.id === id ? { ...a, status: 'RESOLVED', resolvedAt: new Date().toISOString() } : a
    );
    this.notifyAlerts();
  }

  public async addBus(busData: Omit<Bus, 'id' | 'lastLocation' | 'lastSyncTimestamp'>): Promise<Bus> {
    return busService.createBus(busData);
  }

  public async updateBusStatus(busId: string, status: BusStatus): Promise<void> {
    await busService.updateStatus(busId, status);
  }

  public async deleteBus(busId: string): Promise<boolean> {
    return busService.deleteBus(busId);
  }

  public async addRoute(routeData: Omit<Route, 'id'>): Promise<Route> {
    return routeService.createRoute(routeData);
  }

  public async broadcastNotification(data: {
    collegeId?: string;
    title: string;
    message: string;
    category?: NotificationCategory;
    priority?: NotificationPriority;
    routeId?: string;
  }) {
    return notificationService.createNotification({
      collegeId: data.collegeId || 'college_apex',
      title: data.title,
      message: data.message,
      category: data.category || 'ANNOUNCEMENT',
      priority: data.priority || 'NORMAL',
      routeId: data.routeId,
    });
  }

  public getFleetStats(): FleetStats {
    const buses = realtimeService.getBuses();
    const totalBuses = buses.length;
    const activeBuses = buses.filter((b) => b.status === 'ACTIVE').length;
    const idleBuses = buses.filter((b) => b.status === 'IDLE').length;
    const offlineBuses = buses.filter((b) => b.status === 'OFFLINE').length;
    const maintenanceBuses = buses.filter((b) => b.status === 'MAINTENANCE').length;

    let totalOccupancy = 0;
    let totalCapacity = 0;
    buses.filter((b) => b.status === 'ACTIVE').forEach((b) => {
      totalOccupancy += b.currentOccupancy || 0;
      totalCapacity += b.capacity || 0;
    });

    const averageOccupancyPercent = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;
    const activeEmergencies = this.alerts.filter((a) => a.status === 'ACTIVE').length;

    return {
      totalBuses,
      activeBuses,
      idleBuses,
      offlineBuses,
      maintenanceBuses,
      activeTripsCount: activeBuses,
      averageOccupancyPercent,
      activeEmergenciesCount: activeEmergencies,
      onTimePerformanceRate: null,
      totalPassengersMovedToday: null,
    };
  }

  public async getDrivers(): Promise<Driver[]> {
    try {
      const data = await apiClient.get<Driver[]>('/api/admin/drivers');
      if (Array.isArray(data)) return data;
    } catch {
      // Return empty if API unavailable
    }
    return [];
  }

  public async getStudents(): Promise<Student[]> {
    try {
      const data = await apiClient.get<Student[]>('/api/admin/students');
      if (Array.isArray(data)) return data;
    } catch {
      // Return empty if API unavailable
    }
    return [];
  }

  private notifyAlerts(): void {
    this.alertListeners.forEach((l) => l([...this.alerts]));
  }
}

export const adminService = new AdminService();
