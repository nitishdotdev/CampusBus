// Core domain types for Smart Campus Bus SaaS

export type UserRole = 'STUDENT' | 'DRIVER' | 'ADMIN';

export type BusStatus = 'IDLE' | 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';

export type RouteStatus = 'LIVE' | 'DEGRADED' | 'SCHEDULED' | 'OFFLINE';

export type ETAConfidence = 'LIVE' | 'DEGRADED' | 'STALE' | 'OFFLINE' | 'SCHEDULED';

export type GPSStatus = 
  | 'GPS_PERMISSION_REQUIRED'
  | 'GPS_SEARCHING'
  | 'GPS_ACTIVE'
  | 'GPS_UNAVAILABLE'
  | 'LOCATION_STALE';

export type NetworkStatus = 
  | 'NETWORK_ONLINE'
  | 'NETWORK_OFFLINE'
  | 'SYNCING'
  | 'LOCATION_QUEUED';

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null; // meters/sec
  heading?: number | null; // degrees
  timestamp: string;
}

export interface College {
  id: string;
  name: string;
  shortCode: string;
  campusName: string;
  centerLocation: {
    lat: number;
    lng: number;
  };
  defaultZoom: number;
  timezone: string;
}

export interface User {
  id: string;
  collegeId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  studentId?: string;
  employeeId?: string;
  phone?: string;
  status?: string;
  cdlNumber?: string;
}

export interface Stop {
  id: string;
  collegeId: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  sequence: number;
  landmark?: string;
  hasShelter?: boolean;
}

export interface Route {
  id: string;
  collegeId: string;
  code: string; // e.g. "RT-01"
  name: string; // e.g. "North Campus Express"
  description: string;
  color: string; // hex
  status: RouteStatus;
  scheduleHours: string;
  frequencyMinutes: number;
  stops: Stop[];
  pathCoordinates: [number, number][]; // [lat, lng] pairs for polyline
}

export interface UpcomingStopETA {
  stopId: string;
  stopName: string;
  distanceKm: number;
  etaMinutes: number;
  confidence: ETAConfidence;
}

export interface Bus {
  id: string;
  collegeId: string;
  busNumber: string; // e.g. "BUS-104"
  plateNumber: string;
  model: string;
  capacity: number;
  currentOccupancy: number;
  status: BusStatus;
  currentRouteId?: string;
  currentDriverId?: string;
  lastLocation: LocationPoint;
  gpsStatus: GPSStatus;
  networkStatus: NetworkStatus;
  heading?: number;
  speedKmh?: number;
  nextStopId?: string;
  etaToNextStopSeconds?: number;
  etaConfidence: ETAConfidence;
  lastSyncTimestamp: string;
  isSimulated?: boolean;
  driverName?: string;
  upcomingEtas?: UpcomingStopETA[];
  nextStop?: {
    stopName: string;
    etaMinutes: number;
    distanceKm: number;
  };
}

export interface Driver {
  id: string;
  collegeId: string;
  name: string;
  employeeId: string;
  phone: string;
  licenseNumber: string;
  assignedBusId?: string;
  assignedRouteId?: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY';
  rating?: number;
}

export interface Student {
  id: string;
  collegeId: string;
  name: string;
  studentId: string;
  email: string;
  department: string;
  year: string;
  favoriteRouteIds: string[];
}

export interface Trip {
  id: string;
  collegeId: string;
  busId: string;
  driverId: string;
  routeId: string;
  startTime: string;
  endTime?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  currentOccupancy: number;
  initialOccupancy: number;
  totalLocationsLogged: number;
  syncedLocationsCount: number;
  queuedLocationsCount: number;
  distanceCoveredKm: number;
  notes?: string;
}

export interface QueuedLocationUpdate {
  id: string;
  tripId: string;
  busId: string;
  driverId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
  attemptCount: number;
}

export type NotificationCategory = 
  | 'ANNOUNCEMENT' 
  | 'ROUTE_CHANGE' 
  | 'DELAY' 
  | 'CANCELLATION' 
  | 'EMERGENCY';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';

export interface CampusNotification {
  id: string;
  collegeId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  timestamp: string;
  routeId?: string;
  busId?: string;
  isRead?: boolean;
  expiresAt?: string;
}

export interface EmergencyAlert {
  id: string;
  collegeId: string;
  tripId: string;
  busId: string;
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId: string;
  routeName: string;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: 'CRITICAL' | 'WARNING';
  reason?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
}

export interface FleetStats {
  totalBuses: number;
  activeBuses: number;
  idleBuses: number;
  offlineBuses: number;
  maintenanceBuses: number;
  activeTripsCount: number;
  averageOccupancyPercent: number;
  activeEmergenciesCount: number;
  onTimePerformanceRate: number | null; // null = not measured
  totalPassengersMovedToday: number | null; // null = not measured
}
