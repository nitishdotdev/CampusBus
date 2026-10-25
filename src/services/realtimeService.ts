import { Bus, EmergencyAlert, CampusNotification } from '../types';
import { apiClient } from './apiClient';
import { socketService } from './socketService';

type BusUpdateListener = (buses: Bus[]) => void;
type EmergencyListener = (alert: EmergencyAlert) => void;
type NotificationListener = (notif: CampusNotification) => void;
type StopProgressionListener = (data: any) => void;

class RealtimeService {
  private buses: Bus[] = [];
  private busListeners: BusUpdateListener[] = [];
  private emergencyListeners: EmergencyListener[] = [];
  private notificationListeners: NotificationListener[] = [];
  private stopProgressionListeners: StopProgressionListener[] = [];
  private isConnectedToBackend = false;

  constructor() {
    // Listen to real-time events via Socket.IO
    socketService.on('bus:updated', (updatedBus: Bus) => {
      this.handleBusUpdated(updatedBus);
    });

    socketService.on('bus:location', (locData: any) => {
      this.handleBusLocationEvent(locData);
    });

    socketService.on('bus:occupancy', (data: { busId: string; currentOccupancy: number; capacity: number }) => {
      this.handleBusOccupancyEvent(data);
    });

    socketService.on('emergency:alert', (alert: EmergencyAlert) => {
      this.emergencyListeners.forEach((l) => l(alert));
    });

    socketService.on('emergency:admin_alert', (alert: EmergencyAlert) => {
      this.emergencyListeners.forEach((l) => l(alert));
    });

    socketService.on('trip:stop_arrived', (data: any) => {
      this.handleStopArrivedEvent(data);
    });

    socketService.on('trip:stop_approaching', (data: any) => {
      this.stopProgressionListeners.forEach((l) => l({ type: 'APPROACHING', ...data }));
    });

    socketService.on('connection:status', ({ isConnected }: { isConnected: boolean }) => {
      this.isConnectedToBackend = isConnected;
      if (isConnected) {
        this.fetchBusesFromApi();
      }
    });
  }

  public async fetchBusesFromApi(): Promise<Bus[]> {
    try {
      const data = await apiClient.get<Bus[]>('/api/buses');
      if (Array.isArray(data)) {
        this.buses = data;
        this.notifyBusListeners();
        return this.buses;
      }
    } catch (err) {
      console.warn('Could not fetch buses from API:', err);
    }
    return this.buses;
  }

  public getBuses(): Bus[] {
    return [...this.buses];
  }

  public getBusById(id: string): Bus | undefined {
    return this.buses.find((b) => b.id === id);
  }

  public subscribeBuses(listener: BusUpdateListener): () => void {
    this.busListeners.push(listener);
    listener(this.buses);
    return () => {
      this.busListeners = this.busListeners.filter((l) => l !== listener);
    };
  }

  public subscribeEmergency(listener: EmergencyListener): () => void {
    this.emergencyListeners.push(listener);
    return () => {
      this.emergencyListeners = this.emergencyListeners.filter((l) => l !== listener);
    };
  }

  public subscribeNotifications(listener: NotificationListener): () => void {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((l) => l !== listener);
    };
  }

  public broadcastEmergency(alert: EmergencyAlert): void {
    this.emergencyListeners.forEach((l) => l(alert));
  }

  public broadcastNotification(notif: CampusNotification): void {
    this.notificationListeners.forEach((l) => l(notif));
  }

  public setBuses(newBuses: Bus[]): void {
    this.buses = newBuses;
    this.notifyBusListeners();
  }

  private handleBusUpdated(updatedBus: any): void {
    if (!updatedBus || !updatedBus.id) return;
    const idx = this.buses.findIndex((b) => b.id === updatedBus.id);
    const existing = idx !== -1 ? this.buses[idx] : null;

    const normalized: Bus = {
      id: updatedBus.id,
      collegeId: updatedBus.collegeId || updatedBus.college_id || existing?.collegeId || '',
      busNumber: updatedBus.busNumber || updatedBus.bus_number || existing?.busNumber || 'BUS',
      plateNumber: updatedBus.plateNumber || updatedBus.plate_number || existing?.plateNumber || '',
      model: updatedBus.model || existing?.model || 'Campus Transit Bus',
      capacity: updatedBus.capacity ?? existing?.capacity ?? 45,
      currentOccupancy: updatedBus.currentOccupancy ?? updatedBus.current_occupancy ?? existing?.currentOccupancy ?? 0,
      status: (updatedBus.status === 'OFF_DUTY' ? 'IDLE' : updatedBus.status === 'OUT_OF_SERVICE' ? 'OFFLINE' : (updatedBus.status || existing?.status || 'IDLE')) as any,
      currentRouteId: updatedBus.currentRouteId !== undefined ? updatedBus.currentRouteId : (updatedBus.current_route_id !== undefined ? updatedBus.current_route_id : existing?.currentRouteId),
      currentDriverId: updatedBus.currentDriverId !== undefined ? updatedBus.currentDriverId : (updatedBus.current_driver_id !== undefined ? updatedBus.current_driver_id : existing?.currentDriverId),
      driverName: updatedBus.driverName || updatedBus.driver_name || existing?.driverName,
      lastLocation: updatedBus.lastLocation || (updatedBus.last_location_lat != null && updatedBus.last_location_lng != null ? {
        lat: Number(updatedBus.last_location_lat),
        lng: Number(updatedBus.last_location_lng),
        speed: (updatedBus.speed_kmh || 0) / 3.6,
        heading: updatedBus.heading || 0,
        timestamp: updatedBus.last_sync_timestamp || new Date().toISOString(),
      } : existing?.lastLocation),
      heading: updatedBus.heading ?? existing?.heading ?? 0,
      speedKmh: updatedBus.speedKmh ?? updatedBus.speed_kmh ?? existing?.speedKmh ?? 0,
      gpsStatus: updatedBus.gpsStatus || updatedBus.gps_status || existing?.gpsStatus || 'GPS_ACTIVE',
      networkStatus: updatedBus.networkStatus || updatedBus.network_status || existing?.networkStatus || 'NETWORK_ONLINE',
      etaConfidence: updatedBus.etaConfidence || updatedBus.eta_confidence || existing?.etaConfidence || 'LIVE',
      lastSyncTimestamp: updatedBus.lastSyncTimestamp || updatedBus.last_sync_timestamp || existing?.lastSyncTimestamp || new Date().toISOString(),
      isSimulated: updatedBus.isSimulated ?? updatedBus.is_simulated ?? existing?.isSimulated,
      currentStopId: updatedBus.currentStopId !== undefined ? updatedBus.currentStopId : (updatedBus.current_stop_id !== undefined ? updatedBus.current_stop_id : existing?.currentStopId),
      nextStopId: updatedBus.nextStopId !== undefined ? updatedBus.nextStopId : (updatedBus.next_stop_id !== undefined ? updatedBus.next_stop_id : existing?.nextStopId),
      completedStopIds: updatedBus.completedStopIds || updatedBus.completed_stop_ids || existing?.completedStopIds || [],
      upcomingEtas: updatedBus.upcomingEtas || existing?.upcomingEtas,
      nextStop: updatedBus.nextStop || existing?.nextStop,
    };

    if (idx !== -1) {
      this.buses[idx] = normalized;
    } else {
      this.buses.push(normalized);
    }
    this.notifyBusListeners();
  }

  private handleBusLocationEvent(data: any): void {
    const { busId, lat, lng, speedKmh, heading, timestamp, gpsStatus, networkStatus, etaConfidence, isSimulated, currentStopId, nextStopId, completedStopIds, upcomingEtas, nextStop } = data;
    let found = false;
    this.buses = this.buses.map((b) => {
      if (b.id === busId) {
        found = true;
        return {
          ...b,
          status: 'ACTIVE' as const,
          lastLocation: {
            lat: Number(lat),
            lng: Number(lng),
            speed: (speedKmh || 0) / 3.6,
            heading: heading || 0,
            timestamp: timestamp || new Date().toISOString(),
          },
          speedKmh: speedKmh || b.speedKmh,
          heading: heading !== undefined ? heading : b.heading,
          lastSyncTimestamp: timestamp || new Date().toISOString(),
          gpsStatus: gpsStatus || b.gpsStatus,
          networkStatus: networkStatus || b.networkStatus,
          etaConfidence: etaConfidence || b.etaConfidence,
          isSimulated: isSimulated !== undefined ? isSimulated : b.isSimulated,
          currentStopId: currentStopId !== undefined ? currentStopId : b.currentStopId,
          nextStopId: nextStopId !== undefined ? nextStopId : b.nextStopId,
          completedStopIds: completedStopIds || b.completedStopIds,
          upcomingEtas: upcomingEtas || b.upcomingEtas,
          nextStop: nextStop || b.nextStop,
        };
      }
      return b;
    });

    if (!found) {
      this.fetchBusesFromApi();
    } else {
      this.notifyBusListeners();
    }
  }

  private handleStopArrivedEvent(data: any): void {
    const { busId, arrivedStop, nextStop, completedStopIds } = data;
    this.buses = this.buses.map((b) => {
      if (b.id === busId) {
        return {
          ...b,
          currentStopId: arrivedStop?.id || b.currentStopId,
          nextStopId: nextStop ? nextStop.id : null,
          completedStopIds: completedStopIds || b.completedStopIds,
        };
      }
      return b;
    });
    this.notifyBusListeners();
    this.stopProgressionListeners.forEach((l) => l({ type: 'ARRIVED', ...data }));
  }

  public subscribeStopProgression(listener: StopProgressionListener): () => void {
    this.stopProgressionListeners.push(listener);
    return () => {
      this.stopProgressionListeners = this.stopProgressionListeners.filter((l) => l !== listener);
    };
  }

  private handleBusOccupancyEvent(data: { busId: string; currentOccupancy: number; capacity: number }): void {
    this.buses = this.buses.map((b) => {
      if (b.id === data.busId) {
        return {
          ...b,
          currentOccupancy: data.currentOccupancy,
          capacity: data.capacity || b.capacity,
        };
      }
      return b;
    });
    this.notifyBusListeners();
  }

  private notifyBusListeners(): void {
    this.busListeners.forEach((l) => l([...this.buses]));
  }
}

export const realtimeService = new RealtimeService();
