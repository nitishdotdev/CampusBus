import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { MapView } from '../../components/map/MapView';
import { BusStatusBadge, OccupancyIndicator, ETAIndicator } from '../../components/common/StatusBadges';
import { NotificationCard } from '../../components/common/Cards';
import { apiClient } from '../../services/apiClient';
import { notificationService } from '../../services/notificationService';
import { socketService } from '../../services/socketService';
import { socketV1, type BusLocationPayload } from '../../services/v1/socket';
import { Bus, Route } from '../../types';
import {
  Navigation,
  Bus as BusIcon,
  Bell,
  ArrowRight,
  MapPin,
  Calendar,
  Clock,
  Radio,
  Compass,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

interface Schedule {
  id: string;
  bus_id: string;
  route_id: string;
  departure_time: string;
  arrival_time?: string;
  operating_days: string[];
  status: string;
  notes?: string;
}

export const StudentDashboard: React.FC = () => {
  const { currentUser, currentCollege, buses, routes, notifications, isLoadingData } = useApp();

  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');
  const [selectedBusId, setSelectedBusId] = useState<string | undefined>(undefined);
  const [livePositions, setLivePositions] = useState<Map<string, BusLocationPayload>>(new Map());
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState<boolean>(true);

  // Subscribe to socket telemetry
  useEffect(() => {
    if (!USE_V1) return;
    const activeBuses = buses.filter((b) => b.status === 'ACTIVE');
    if (activeBuses.length === 0) return;

    const unsubs = activeBuses.map((b) =>
      socketV1.subscribeTobus(b.id, (payload) => {
        setLivePositions((prev) => new Map(prev).set(b.id, payload));
      })
    );
    return () => unsubs.forEach((fn) => fn());
  }, [buses]);

  // Fetch real upcoming schedules from backend API
  useEffect(() => {
    let isMounted = true;
    const fetchSchedules = async () => {
      try {
        setLoadingSchedules(true);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        const res = await apiClient.get<Schedule[]>(`/api/schedules?operatingDay=${today}`);
        if (isMounted && Array.isArray(res)) {
          setUpcomingSchedules(res.filter((s) => s.status === 'ACTIVE').slice(0, 4));
        }
      } catch (err) {
        console.warn('Could not load schedules for student dashboard:', err);
      } finally {
        if (isMounted) setLoadingSchedules(false);
      }
    };
    fetchSchedules();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter active buses based on selected route
  const activeBuses = buses.filter((b) => b.status === 'ACTIVE');

  // Enriched active buses with live telemetry if available
  const enrichedActiveBuses = activeBuses.map((b) => {
    const l = livePositions.get(b.id);
    if (!l) return b;
    const stale = l.freshness === 'STALE' || l.freshness === 'UNAVAILABLE';
    return {
      ...b,
      lastLocation: {
        lat: l.location.lat,
        lng: l.location.lng,
        timestamp: l.receivedAt,
        accuracy: l.accuracyM ?? undefined,
      },
      heading: l.headingDeg ?? b.heading,
      speedKmh: l.speedMps != null ? Math.round(l.speedMps * 3.6) : b.speedKmh,
      gpsStatus: stale ? ('LOCATION_STALE' as const) : ('GPS_ACTIVE' as const),
      lastSyncTimestamp: l.receivedAt,
    };
  });

  // Display active operating buses with live telemetry on the map
  const displayedBuses = enrichedActiveBuses.filter((b) =>
    selectedRouteId === 'ALL' ? true : b.currentRouteId === selectedRouteId
  );

  const selectedBus =
    displayedBuses.find((b) => b.id === selectedBusId) ||
    displayedBuses[0] ||
    (selectedRouteId !== 'ALL' ? buses.find((b) => b.currentRouteId === selectedRouteId) : undefined);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const selectedBusRoute = routes.find((r) => r.id === selectedBus?.currentRouteId);

  // Time since GPS update helper
  const getGpsUpdateAge = (timestamp?: string) => {
    if (!timestamp) return { text: 'No telemetry', isStale: true };
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (diffSec < 60) return { text: `${diffSec}s ago`, isStale: false };
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return { text: `${diffMin}m ago`, isStale: diffMin >= 2 };
    return { text: `${Math.floor(diffMin / 60)}h ago`, isStale: true };
  };

  const gpsAge = getGpsUpdateAge(selectedBus?.lastLocation?.timestamp || selectedBus?.lastSyncTimestamp);

  const recentNotifications = notifications.slice(0, 3);

  const handleMarkNotificationRead = (id: string) => {
    notificationService.markAsRead(id);
  };

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-6 h-36" />
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-6 h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Route Selector */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-700/60 border border-blue-500/40 text-[11px] font-semibold text-blue-100 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Campus Transit • {currentCollege.campusName}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Live Shuttle Tracker{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}
            </h2>
            <p className="text-xs text-blue-100 mt-1">
              {activeBuses.length > 0
                ? `${activeBuses.length} campus shuttle${activeBuses.length !== 1 ? 's' : ''} currently operating with real-time GPS telemetry.`
                : 'No buses are currently running active trips. Stored route paths and scheduled stops are displayed below.'}
            </p>
          </div>

          {/* Route Selector Dropdown */}
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 shrink-0">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-blue-200 mb-1">
              Filter by Line
            </label>
            <select
              value={selectedRouteId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedRouteId(newId);
                if (newId !== 'ALL') {
                  const busOnRoute = enrichedActiveBuses.find((b) => b.currentRouteId === newId);
                  if (busOnRoute) setSelectedBusId(busOnRoute.id);
                  else setSelectedBusId(undefined);
                }
              }}
              className="w-full sm:w-56 px-3 py-2 bg-white text-slate-900 font-bold text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-xs cursor-pointer"
            >
              <option value="ALL">All Routes ({activeBuses.length} active)</option>
              {routes.map((r) => {
                const count = activeBuses.filter((b) => b.currentRouteId === r.id).length;
                return (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name} {count > 0 ? `(${count} active)` : '(Offline)'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Primary Feature: Interactive Map with Bus Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real Interactive Map */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <MapView
              buses={displayedBuses}
              routes={selectedRouteId === 'ALL' ? routes : routes.filter((r) => r.id === selectedRouteId)}
              selectedBusId={selectedBus?.id}
              selectedRouteId={selectedRouteId !== 'ALL' ? selectedRouteId : undefined}
              onSelectBus={(b) => setSelectedBusId(b.id)}
              heightClass="h-[460px] sm:h-[540px]"
            />

            {/* Quick Bus Selector Overlay at bottom of Map */}
            {displayedBuses.length > 0 && (
              <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center gap-2 overflow-x-auto pb-1">
                {displayedBuses.map((bus) => {
                  const r = routes.find((rt) => rt.id === bus.currentRouteId);
                  const isSelected = selectedBus?.id === bus.id;
                  return (
                    <button
                      key={bus.id}
                      onClick={() => setSelectedBusId(bus.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-2 shadow-md transition-all cursor-pointer backdrop-blur-md ${
                        isSelected
                          ? 'bg-slate-900 text-white ring-2 ring-blue-500 scale-105'
                          : 'bg-white/95 text-slate-800 hover:bg-white'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: r?.color || '#2563EB' }}
                      />
                      <span>Bus {bus.busNumber}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${bus.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Empty state notice if route selected has no active buses */}
          {selectedRouteId !== 'ALL' && displayedBuses.length === 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">No active shuttles currently on this route.</span>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Showing designated route corridor and official stops. A bus marker will appear as soon as an assigned driver starts service.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bus Details & Telemetry Panel */}
        <div className="space-y-4">
          {selectedBus ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <BusIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">{selectedBus.busNumber}</h3>
                    <p className="text-xs text-slate-500">
                      {selectedBus.model} • {selectedBus.plateNumber}
                    </p>
                  </div>
                </div>
                <BusStatusBadge status={selectedBus.status} />
              </div>

              {selectedBusRoute ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Operating Route
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: selectedBusRoute.color }}
                    />
                    <span>
                      {selectedBusRoute.code} — {selectedBusRoute.name}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No assigned route</div>
              )}

              {/* Next Stop & ETA */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between text-[10px] font-bold text-blue-700 uppercase">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Next Stop
                    </span>
                    {selectedBusRoute?.stops?.length ? (
                      <span className="text-[9px] text-blue-600 font-semibold font-mono">
                        {(selectedBus.completedStopIds?.length || 0)}/{selectedBusRoute.stops.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="font-bold text-xs text-slate-900 mt-1 truncate">
                    {(() => {
                      const nextId = selectedBus.nextStopId;
                      const matchingStop = nextId ? selectedBusRoute?.stops?.find((s) => s.id === nextId) : undefined;
                      if (matchingStop) return matchingStop.name;
                      if (selectedBus.nextStop?.stopName) return selectedBus.nextStop.stopName;
                      if (
                        selectedBus.completedStopIds &&
                        selectedBusRoute?.stops?.length &&
                        selectedBus.completedStopIds.length >= selectedBusRoute.stops.length
                      ) {
                        return 'All Stops Completed';
                      }
                      return selectedBusRoute?.stops?.[0]?.name ?? 'Terminal';
                    })()}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Arrival ETA
                  </div>
                  <div className="mt-1">
                    <ETAIndicator
                      seconds={
                        selectedBus.nextStop?.etaMinutes
                          ? selectedBus.nextStop.etaMinutes * 60
                          : selectedBus.etaToNextStopSeconds
                      }
                      confidence={selectedBus.etaConfidence || 'LIVE'}
                    />
                  </div>
                </div>
              </div>

              {/* Occupancy Indicator */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                <OccupancyIndicator current={selectedBus.currentOccupancy} capacity={selectedBus.capacity} />
              </div>

              {/* GPS Freshness Indicator */}
              <div
                className={`p-3 rounded-xl border text-xs ${
                  !gpsAge.isStale
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-600" />
                    GPS Signal Freshness:
                  </span>
                  <span className="font-mono font-bold">{gpsAge.text}</span>
                </div>
                {gpsAge.isStale && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    GPS updates are delayed. Vehicle may be in a low-cellular zone.
                  </p>
                )}
              </div>

              {/* Speed & Heading */}
              <div className="text-xs space-y-1.5 pt-1 border-t border-slate-100 text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-slate-400" /> Speed:
                  </span>
                  <span className="font-bold text-slate-800">{selectedBus.speedKmh || 0} km/h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> Coordinates:
                  </span>
                  <span className="font-mono text-[11px] text-slate-700">
                    {typeof selectedBus.lastLocation?.lat === 'number' && typeof selectedBus.lastLocation?.lng === 'number'
                      ? `${selectedBus.lastLocation.lat.toFixed(4)}, ${selectedBus.lastLocation.lng.toFixed(4)}`
                      : 'Standby / No GPS'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <BusIcon className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-slate-800">No Bus Selected</h4>
              <p className="text-xs text-slate-500">
                Select an active bus on the map or choose a route to view live arrival times and occupancy.
              </p>
            </div>
          )}

          {/* Quick Links Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Transit Shortcuts</h4>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/student/schedules"
                className="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Schedules</span>
              </Link>
              <Link
                to="/student/routes"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <MapPin className="w-4 h-4 text-slate-600" />
                <span>All Routes</span>
              </Link>
              <Link
                to="/student/complaints"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-slate-600" />
                <span>Feedback</span>
              </Link>
              <Link
                to="/student/profile"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-600" />
                <span>Account</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Summaries: Upcoming Schedules & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Schedules */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Today&apos;s Departure Schedules</h3>
                <p className="text-xs text-slate-500">Planned campus service timetable</p>
              </div>
            </div>
            <Link
              to="/student/schedules"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Full schedule <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loadingSchedules ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading schedules...</div>
          ) : upcomingSchedules.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {upcomingSchedules.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Route {s.route_id}</span>
                    <span className="text-slate-400 ml-2">Vehicle #{s.bus_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-bold text-slate-800 font-mono">{s.departure_time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              No planned departures remaining for today.
            </div>
          )}
        </div>

        {/* Recent Transport Notices */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Transit Announcements</h3>
                <p className="text-xs text-slate-500">Safety alerts and service updates</p>
              </div>
            </div>
            <Link
              to="/student/notifications"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentNotifications.length > 0 ? (
            <div className="space-y-2.5">
              {recentNotifications.map((n) => (
                <NotificationCard key={n.id} notification={n} onMarkRead={handleMarkNotificationRead} />
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              No new transit notices at this time.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
