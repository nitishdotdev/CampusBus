import type { Bus, CampusNotification, EmergencyAlert, Route } from '../../types';
import type { V1Bus } from './buses';
import type { V1Notification, V1Alert, V1Schedule } from './notifications';
import type { V1Route } from './routes';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayNameToIndex(name: string): number {
  return DAY_NAMES.indexOf(name);
}

export function v1BusToUi(b: V1Bus, activeTripBusIds?: Set<string>): Bus {
  const onTrip = activeTripBusIds?.has(b.id) ?? false;
  return {
    id: b.id,
    collegeId: b.campusId,
    busNumber: b.number,
    plateNumber: '',
    model: 'Campus Shuttle',
    capacity: b.capacity,
    currentOccupancy: 0,
    status: b.status === 'MAINTENANCE' ? 'MAINTENANCE' : b.status === 'OFFLINE' ? 'OFFLINE' : onTrip ? 'ACTIVE' : 'IDLE',
    currentDriverId: b.driverId ?? undefined,
    currentRouteId: b.routeId ?? undefined,
    gpsStatus: 'GPS_UNAVAILABLE',
    networkStatus: 'NETWORK_ONLINE',
    etaConfidence: 'OFFLINE',
    lastSyncTimestamp: new Date().toISOString(),
    isSimulated: false,
  };
}

export function v1RouteToUi(r: V1Route): Route {
  return {
    id: r.id,
    collegeId: r.campusId,
    name: r.name,
    code: r.code,
    color: r.color,
    description: '',
    status: 'LIVE',
    scheduleHours: '',
    frequencyMinutes: 0,
    pathCoordinates: r.stops.map((s) => [s.lat, s.lng] as [number, number]),
    stops: r.stops.map((s) => ({
      id: s.id,
      collegeId: r.campusId,
      name: s.name,
      code: '',
      lat: s.lat,
      lng: s.lng,
      sequence: s.order,
    })),
  };
}

export function v1NotificationToUi(n: V1Notification): CampusNotification {
  const category = n.kind === 'ROUTE_CHANGE' ? 'ROUTE_CHANGE'
    : n.kind === 'DELAY' ? 'DELAY'
    : n.kind === 'EMERGENCY' ? 'EMERGENCY'
    : 'ANNOUNCEMENT';
  const priority = n.priority === 'URGENT' ? 'EMERGENCY' : n.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
  return {
    id: n.id,
    collegeId: n.campusId,
    category,
    priority,
    title: n.title,
    message: n.body,
    timestamp: n.createdAt,
    isRead: false,
    routeId: n.routeId ?? undefined,
    expiresAt: n.expiresAt ?? undefined,
  };
}

export function v1AlertToUi(a: V1Alert): EmergencyAlert {
  return {
    id: a.id,
    collegeId: a.campusId,
    tripId: a.tripId ?? '',
    busId: a.busId,
    busNumber: '',
    driverId: a.raisedBy,
    driverName: '',
    routeId: '',
    routeName: '',
    timestamp: a.createdAt,
    location: a.location ?? { lat: 0, lng: 0 },
    status: a.status === 'OPEN' ? 'ACTIVE' : a.status === 'RESOLVED' ? 'RESOLVED' : 'ACKNOWLEDGED',
    severity: 'CRITICAL',
    reason: a.message ?? undefined,
    acknowledgedBy: a.acknowledgedBy ?? undefined,
    resolvedAt: a.resolvedAt ?? undefined,
  };
}

export interface UiSchedule {
  id: string;
  bus_id: string;
  route_id: string;
  departure_time: string;
  arrival_time?: string;
  operating_days: string[];
  status: string;
  notes?: string;
}

export function v1ScheduleToUi(s: V1Schedule): UiSchedule {
  return {
    id: s.id,
    bus_id: s.busId,
    route_id: s.routeId,
    departure_time: s.departTime,
    operating_days: s.daysOfWeek.map((d) => DAY_NAMES[d]).filter(Boolean),
    status: s.active ? 'ACTIVE' : 'INACTIVE',
    notes: s.direction === 'FROM_CAMPUS' ? 'From campus' : 'To campus',
  };
}
