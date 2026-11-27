import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Bus, CampusNotification, College, EmergencyAlert, Route, RouteStatus, Trip, User, UserRole } from '../types';
import { authService } from '../services/authService';
import { locationService, type LocationServiceState } from '../services/locationService';
import { tripService } from '../services/tripService';
import { listCampuses, type V1Campus } from '../services/v1/auth';
import { v1AlertToUi, v1BusToUi, v1NotificationToUi, v1RouteToUi, v1TripToUi } from '../services/v1/adapters';
import { busesV1 } from '../services/v1/buses';
import { alertsV1, notificationsV1 } from '../services/v1/notifications';
import { ApiV1Error } from '../services/v1/client';
import { allPages } from '../services/v1/pages';
import { routesV1 } from '../services/v1/routes';
import { socketV1 } from '../services/v1/socket';
import { tripsV1 } from '../services/v1/trips';

const unknownCampus: College = {
  id: '', name: 'Campus', shortCode: '', campusName: '',
  centerLocation: { lat: 0, lng: 0 }, defaultZoom: 2, timezone: 'UTC',
};

interface AppContextType {
  currentUser: User | null;
  role: UserRole;
  currentCollege: College;
  v1Campuses: V1Campus[];
  logout: () => void;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  buses: Bus[];
  routes: Route[];
  trips: Trip[];
  activeTrip: Trip | null;
  notifications: CampusNotification[];
  markNotificationsRead: (ids: string[]) => void;
  unreadCount: number;
  emergencyAlerts: EmergencyAlert[];
  activeEmergencyCount: number;
  isLoadingData: boolean;
  dataError: string | null;
  locationState: LocationServiceState;
  toggleSimulatedOffline: (simulateOffline: boolean) => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

function routeTracking(buses: Bus[]): Map<string, RouteStatus> {
  const status = new Map<string, RouteStatus>();
  for (const bus of buses) {
    if (!bus.currentRouteId || !bus.activeTripId) continue;
    const next = bus.trackingStatus === 'LIVE' && !bus.isSimulated ? 'LIVE' : 'DEGRADED';
    if (status.get(bus.currentRouteId) !== 'LIVE') status.set(bus.currentRouteId, next);
  }
  return status;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser());
  const [campuses, setCampuses] = useState<V1Campus[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [notificationRecords, setNotifications] = useState<CampusNotification[]>([]);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);
  const [locationState, setLocationState] = useState(locationService.getState());
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = authService.subscribe(user => {
      requestVersion.current++;
      setCurrentUser(user);
      setBuses([]);
      setRoutes([]);
      setTrips([]);
      setActiveTrip(null);
      setNotifications([]);
      setEmergencyAlerts([]);
      setDataError(null);
      setIsLoadingData(Boolean(user));
      locationService.setDriver(user?.role === 'DRIVER' ? user.id : null);
      if (!user) tripService.clearActiveTrip();
    });
    void authService.restore().finally(() => { if (mounted) setIsRestoringSession(false); });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    socketV1.connect();
    return locationService.subscribe(setLocationState);
  }, [currentUser]);

  const loadData = useCallback(async (showLoading = false) => {
    if (!currentUser) return;
    const version = ++requestVersion.current;
    if (showLoading) setIsLoadingData(true);
    const stillCurrent = () => requestVersion.current === version && authService.getCurrentUser() === currentUser;
    try {
      const [campusRecords, busRecords, routeRecords, notificationRows, alertRows, tripRows, activeRows] = await Promise.all([
        listCampuses(),
        allPages(page => busesV1.list(page, 100)),
        allPages(page => routesV1.list(page, 100)),
        notificationsV1.list(),
        currentUser.role === 'ADMIN' ? alertsV1.list() : Promise.resolve(null),
        currentUser.role === 'STUDENT' ? Promise.resolve(null) : tripsV1.list(1, 100),
        currentUser.role === 'DRIVER' ? tripsV1.list(1, 1, 'ACTIVE') : Promise.resolve(null),
      ]);
      if (!stillCurrent()) return;
      const fleet = busRecords.map(bus => v1BusToUi(bus));
      const tracking = routeTracking(fleet);
      setCampuses(campusRecords);
      locationService.setReportingInterval(campusRecords.find(campus => campus.id === currentUser.collegeId)?.gpsIntervalSeconds ?? 3);
      setBuses(fleet);
      setRoutes(routeRecords.map(route => v1RouteToUi(route, tracking.get(route.id))));
      setNotifications(notificationRows.items.map(v1NotificationToUi));
      setEmergencyAlerts(alertRows?.items.map(alert => {
        const bus = fleet.find(item => item.id === alert.busId);
        return { ...v1AlertToUi(alert), busNumber: bus?.busNumber ?? '', routeName: routeRecords.find(route => route.id === bus?.currentRouteId)?.name ?? '' };
      }) ?? []);
      setTrips(tripRows?.items.map(v1TripToUi) ?? []);
      if (currentUser.role === 'DRIVER') {
        const active = activeRows?.items[0];
        const adopted = tripService.getActiveTrip();
        if (active) {
          const trip = tripService.adoptV1Trip(active);
          if (active.id !== adopted?.id) locationService.startTracking(trip.id, trip.busId, currentUser.id);
        } else if (adopted) {
          tripService.clearActiveTrip();
        }
      }
      if (stillCurrent()) setDataError(null);
    } catch (error) {
      if (!stillCurrent()) return;
      if (error instanceof ApiV1Error && (error.code === 'ACCOUNT_NOT_ACTIVE' || error.status === 401)) {
        authService.logout();
        return;
      }
      setDataError('Could not refresh campus data. Try again when your connection is available.');
    } finally {
      if (stillCurrent()) setIsLoadingData(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    void loadData(true);
    const timer = window.setInterval(() => { if (!document.hidden) void loadData(); }, 15_000);
    return () => { window.clearInterval(timer); };
  }, [currentUser, loadData]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'DRIVER') return;
    return tripService.subscribeActiveTrip(setActiveTrip);
  }, [currentUser]);

  const readKey = currentUser ? `campusbus_notification_reads_${currentUser.id}` : null;
  useEffect(() => {
    if (!readKey) { setReadNotifications(new Set()); return; }
    try { setReadNotifications(new Set(JSON.parse(localStorage.getItem(readKey) ?? '[]'))); }
    catch { setReadNotifications(new Set()); }
  }, [readKey]);

  const markNotificationsRead = (ids: string[]) => {
    const next = new Set([...readNotifications, ...ids]);
    setReadNotifications(next);
    if (readKey) localStorage.setItem(readKey, JSON.stringify([...next]));
  };
  const notifications = useMemo(() => notificationRecords.map(item => ({ ...item, isRead: readNotifications.has(item.id) })), [notificationRecords, readNotifications]);
  const campus = campuses.find(item => item.id === currentUser?.collegeId);
  const currentCollege: College = campus ? {
    id: campus.id, name: campus.name, shortCode: campus.shortCode, campusName: campus.city,
    centerLocation: { lat: campus.lat, lng: campus.lng }, defaultZoom: campus.zoom, timezone: campus.timezone,
    gpsIntervalSeconds: campus.gpsIntervalSeconds, dispatchPhone: campus.dispatchPhone,
  } : unknownCampus;

  const value: AppContextType = {
    currentUser, role: currentUser?.role ?? 'STUDENT', currentCollege, v1Campuses: campuses,
    logout: () => authService.logout(),
    isAuthenticated: authService.isAuthenticated(), isRestoringSession,
    buses, routes, trips, activeTrip, notifications, markNotificationsRead,
    unreadCount: notifications.filter(item => !item.isRead).length,
    emergencyAlerts, activeEmergencyCount: emergencyAlerts.filter(item => item.status === 'ACTIVE').length,
    isLoadingData, dataError, locationState,
    toggleSimulatedOffline: simulate => locationService.toggleSimulatedOffline(simulate),
    refreshData: () => loadData(),

  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider.');
  return context;
}
