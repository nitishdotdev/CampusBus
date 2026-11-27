import type { Bus, CampusNotification, EmergencyAlert, Route, RouteStatus, Trip } from '../../types';
import type { V1Bus } from './buses';
import type { V1Notification, V1Alert, V1Schedule, ScheduleDirection } from './notifications';
import type { V1Route } from './routes';
import type { V1Trip } from './trips';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayNameToIndex(name: string): number {
  return DAY_NAMES.indexOf(name);
}

export function v1BusToUi(b: V1Bus, activeTripBusIds?: Set<string>): Bus {
  const onTrip = b.activeTrip != null || Boolean(activeTripBusIds?.has(b.id));
  const freshness = b.activeTrip?.freshness;
  return {
    id: b.id,
    collegeId: b.campusId,
    busNumber: b.number,
    plateNumber: b.plateNumber ?? '',
    model: b.model ?? '',
    driverName: b.driverName ?? undefined,
    capacity: b.capacity,
    currentOccupancy: b.currentOccupancy ?? 0,
    hasOccupancy: b.currentOccupancy != null,
    status: b.status === 'MAINTENANCE' ? 'MAINTENANCE' : b.status === 'OFFLINE' ? 'OFFLINE' : onTrip ? 'ACTIVE' : 'IDLE',
    operationalStatus: b.status,
    activeTripId: b.activeTrip?.id, canTrack: b.canTrack,
    nextStopId: b.activeTrip?.nextStopId, completedStopIds: b.activeTrip?.completedStopIds,
    trackingStatus: freshness,
    currentDriverId: b.driverId ?? undefined,
    currentRouteId: b.activeTrip?.routeId ?? b.routeId ?? undefined,
    gpsStatus: freshness === 'LIVE' ? 'GPS_ACTIVE' : freshness === 'STALE' ? 'LOCATION_STALE' : 'GPS_UNAVAILABLE',
    networkStatus: freshness === 'LIVE' ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
    etaConfidence: 'OFFLINE',
    lastSyncTimestamp: '',
    isSimulated: b.activeTrip?.mode === 'SIMULATED',
  };
}

export function v1RouteToUi(r: V1Route, status: RouteStatus = 'OFFLINE'): Route {
  return {
    id: r.id,
    collegeId: r.campusId,
    name: r.name,
    code: r.code,
    color: r.color,
    description: '',
    status,
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

export function v1TripToUi(trip: V1Trip): Trip {
  return {
    id: trip.id, collegeId: trip.campusId, busId: trip.busId, driverId: trip.driverId, routeId: trip.routeId,
    startTime: trip.startedAt, endTime: trip.endedAt ?? undefined,
    status: trip.status === 'ACTIVE' ? 'IN_PROGRESS' : trip.status,
    currentOccupancy: trip.currentOccupancy ?? 0, hasOccupancy: trip.currentOccupancy != null,
    completedStopIds: trip.completedStopIds, nextStopId: trip.nextStopId,
    currentStopId: trip.completedStopIds?.[trip.completedStopIds.length - 1],
    initialOccupancy: 0, totalLocationsLogged: trip.totalLocationsLogged ?? 0,
    syncedLocationsCount: trip.totalLocationsLogged ?? 0, queuedLocationsCount: 0, distanceCoveredKm: 0,
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
  direction: ScheduleDirection;
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
    arrival_time: s.arriveTime ?? undefined, direction: s.direction,
    operating_days: s.daysOfWeek.map((d) => DAY_NAMES[d]).filter(Boolean),
    status: s.active ? 'ACTIVE' : 'INACTIVE',
    notes: s.direction === 'FROM_CAMPUS' ? 'From campus' : 'To campus',
  };
}
