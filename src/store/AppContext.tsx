import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  User,
  UserRole,
  College,
  Bus,
  Route,
  Trip,
  CampusNotification,
  EmergencyAlert,
} from '../types';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { realtimeService } from '../services/realtimeService';
import { routeService } from '../services/routeService';
import { tripService } from '../services/tripService';
import { locationService, LocationServiceState } from '../services/locationService';
import { notificationService } from '../services/notificationService';
import { adminService } from '../services/adminService';

// ── v1 API integration (enabled via VITE_USE_V1_API=true) ────────────────────
const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';
import { loginV1, logoutV1, getMeV1, listCampuses, type V1Campus, type V1SessionUser } from '../services/v1/auth';
import { busesV1 } from '../services/v1/buses';
import { routesV1 } from '../services/v1/routes';
import { notificationsV1, alertsV1 } from '../services/v1/notifications';
import { socketV1 } from '../services/v1/socket';

const DEFAULT_COLLEGE: College = {
  id: 'college_apex',
  name: 'Apex State University',
  shortCode: 'ASU',
  campusName: 'Main Campus',
  centerLocation: { lat: 34.0537, lng: -118.2570 },
  defaultZoom: 15,
  timezone: 'America/Los_Angeles',
};

interface AppContextType {
  currentUser: User | null;
  role: UserRole;
  currentCollege: College;
  colleges: College[];
  /** Available campuses from the v1 API (empty when v1 is off). */
  v1Campuses: V1Campus[];
  switchCollege: (collegeId: string) => void;
  logout: () => void;
  isAuthenticated: boolean;

  // Data
  buses: Bus[];
  routes: Route[];
  trips: Trip[];
  activeTrip: Trip | null;
  notifications: CampusNotification[];
  unreadCount: number;
  emergencyAlerts: EmergencyAlert[];
  activeEmergencyCount: number;

  // Loading states
  isLoadingData: boolean;
  dataError: string | null;

  // Location / GPS / Network
  locationState: LocationServiceState;
  toggleSimulatedOffline: (simulateOffline: boolean) => void;

  // Refresh & Reset
  refreshData: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser());
  const [currentCollege, setCurrentCollege] = useState<College>(DEFAULT_COLLEGE);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(tripService.getActiveTrip());
  const [notifications, setNotifications] = useState<CampusNotification[]>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);
  const [locationState, setLocationState] = useState<LocationServiceState>(locationService.getState());
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [v1Campuses, setV1Campuses] = useState<V1Campus[]>([]);
  const [colleges, setColleges] = useState<College[]>([DEFAULT_COLLEGE]);

  // Load campuses from v1 API (always, so login form can list them)
  useEffect(() => {
    if (!USE_V1) return;
    listCampuses().then(setV1Campuses).catch(() => setV1Campuses([]));
  }, []);

  // Connect socketV1 when authenticated under v1
  useEffect(() => {
    if (!USE_V1 || !currentUser) return;
    socketV1.connect();
    return () => { /* keep socket alive while session is active */ };
  }, [currentUser?.id]);

  const isAuthenticated = authService.isAuthenticated();

  useEffect(() => {
    if (!currentUser?.collegeId) return;
    apiClient
      .get<{
        id: string;
        name: string;
        shortCode: string;
        campusName?: string;
        centerLocation?: { lat: number; lng: number };
        defaultZoom?: number;
        timezone?: string;
      }>(`/api/colleges/${currentUser.collegeId}`)
      .then((c) => {
        if (!c?.id) return;
        const mapped: College = {
          id: c.id,
          name: c.name,
          shortCode: c.shortCode,
          campusName: c.campusName || c.name,
          centerLocation: c.centerLocation || { lat: 0, lng: 0 },
          defaultZoom: c.defaultZoom ?? 15,
          timezone: c.timezone || 'UTC',
        };
        setCurrentCollege(mapped);
        setColleges([mapped]);
      })
      .catch(() => {});
  }, [currentUser?.collegeId]);

  // Auth subscription
  useEffect(() => {
    const unsubAuth = authService.subscribe((user) => {
      setCurrentUser(user);
      if (user) {
        // Load data when user is authenticated
        loadAllData();
      } else {
        // Clear all data on logout
        setBuses([]);
        setRoutes([]);
        setTrips([]);
        setActiveTrip(null);
        setNotifications([]);
        setEmergencyAlerts([]);
        setIsLoadingData(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Data subscriptions (only when authenticated)
  useEffect(() => {
    if (!currentUser) return;

    const unsubBuses = realtimeService.subscribeBuses(setBuses);
    const unsubTrips = tripService.subscribeActiveTrip((trip) => {
      setActiveTrip(trip);
      setTrips(tripService.getTripHistory());
    });
    const unsubLoc = locationService.subscribe(setLocationState);
    const unsubNotif = notificationService.subscribe(setNotifications);
    const unsubAlerts = adminService.subscribeAlerts(setEmergencyAlerts);

    // Load data
    loadAllData();

    return () => {
      unsubBuses();
      unsubTrips();
      unsubLoc();
      unsubNotif();
      unsubAlerts();
    };
  }, [currentUser]);

  // Trip Recovery After Disconnect (for drivers)
  useEffect(() => {
    const recoverActiveTrip = async () => {
      try {
        const response = await apiClient.get<{ activeTrip: Trip | null }>('/api/trips/active');
        if (response && response.activeTrip) {
          setActiveTrip(response.activeTrip);
          if (response.activeTrip.status === 'IN_PROGRESS') {
            locationService.startTracking(
              response.activeTrip.id,
              response.activeTrip.busId,
              currentUser?.id || ''
            );
          }
        }
      } catch (err) {
        console.warn('Failed to recover active trip on connect:', err);
      }
    };

    if (currentUser?.role === 'DRIVER') {
      recoverActiveTrip();
    }
  }, [currentUser]);

  // Persistent storage for active trip
  useEffect(() => {
    if (activeTrip) {
      localStorage.setItem('smart_campus_bus_active_trip', JSON.stringify(activeTrip));
    } else {
      localStorage.removeItem('smart_campus_bus_active_trip');
    }
  }, [activeTrip]);

  const role: UserRole = currentUser?.role || 'STUDENT';

  const loadAllData = async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      if (USE_V1) {
        // ── v1 API path ─────────────────────────────────────────────────────
        const [busPage, routePage, notifPage, alertPage] = await Promise.allSettled([
          busesV1.list(),
          routesV1.list(),
          notificationsV1.list(),
          alertsV1.list(),
        ]);
        if (busPage.status === 'fulfilled') {
          setBuses(busPage.value.items.map(b => ({
            id: b.id, collegeId: b.campusId, busNumber: b.number,
            capacity: b.capacity, currentOccupancy: 0,
            status: b.status === 'ACTIVE' ? 'ACTIVE' : b.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'INACTIVE',
            driverId: b.driverId ?? undefined, routeId: b.routeId ?? undefined,
            isSimulated: false,
          } as any)));
        }
        if (routePage.status === 'fulfilled') {
          setRoutes(routePage.value.items.map(r => ({
            id: r.id, collegeId: r.campusId, name: r.name, shortCode: r.code, color: r.color,
            stops: r.stops.map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, order: s.order })),
          } as any)));
        }
        if (notifPage.status === 'fulfilled') {
          setNotifications(notifPage.value.items.map(n => ({
            id: n.id, collegeId: n.campusId, type: n.kind, priority: n.priority,
            title: n.title, message: n.body, timestamp: n.createdAt, isRead: false,
            routeId: n.routeId ?? undefined, expiresAt: n.expiresAt ?? undefined,
          } as any)));
        }
        if (alertPage.status === 'fulfilled') {
          setEmergencyAlerts(alertPage.value.items.map(a => ({
            id: a.id, collegeId: a.campusId, type: 'SOS', severity: 'HIGH',
            title: a.message ?? 'Emergency alert', description: a.message ?? '',
            busId: a.busId, driverId: a.raisedBy, tripId: a.tripId ?? undefined,
            status: a.status === 'OPEN' ? 'ACTIVE' : a.status === 'RESOLVED' ? 'RESOLVED' : 'ACKNOWLEDGED',
            timestamp: a.createdAt, location: a.location ?? undefined,
            acknowledgedBy: a.acknowledgedBy ?? undefined, resolvedBy: a.resolvedBy ?? undefined,
          } as any)));
        }
      } else {
        // ── Legacy API path ───────────────────────────────────────────────────
        const [busesResult, routesResult] = await Promise.all([
          realtimeService.fetchBusesFromApi(),
          routeService.getRoutes(),
        ]);
        if (routesResult) setRoutes(routesResult);
      }
      setIsLoadingData(false);
    } catch (err: any) {
      setDataError(err.message || 'Failed to load data.');
      setIsLoadingData(false);
    }
  };

  const logout = () => {
    if (USE_V1) { logoutV1(); socketV1.disconnect(); }
    authService.logout();
  };

  const switchCollege = (collegeId: string) => {
    const found = colleges.find((c) => c.id === collegeId);
    if (found) setCurrentCollege(found);
  };

  const refreshData = async () => {
    await loadAllData();
    setBuses(realtimeService.getBuses());
    setTrips(tripService.getTripHistory());
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const activeEmergencyCount = useMemo(
    () => emergencyAlerts.filter((a) => a.status === 'ACTIVE').length,
    [emergencyAlerts]
  );

  const toggleSimulatedOffline = (simulateOffline: boolean) => {
    locationService.toggleSimulatedOffline(simulateOffline);
  };

  const resetAllData = async () => {
    localStorage.clear();
    locationService.stopTracking();
    await loadAllData();
  };

  const value: AppContextType = {
    currentUser,
    role,
    currentCollege,
    colleges,
    v1Campuses,
    switchCollege,
    logout,
    isAuthenticated,
    buses,
    routes,
    trips,
    activeTrip,
    notifications,
    unreadCount,
    emergencyAlerts,
    activeEmergencyCount,
    isLoadingData,
    dataError,
    locationState,
    toggleSimulatedOffline,
    refreshData,
    resetAllData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
