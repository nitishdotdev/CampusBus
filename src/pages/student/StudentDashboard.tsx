import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { MapView } from '../../components/map/MapView';
import { BusStatusBadge, OccupancyIndicator, ETAIndicator } from '../../components/common/StatusBadges';
import { NotificationCard } from '../../components/common/Cards';
import { useLiveBuses } from '../../hooks/useLiveBuses';
import { estimateArrivalSeconds } from '../../services/arrivalEstimate';
import { allPages } from '../../services/v1/pages';
import { schedulesV1 } from '../../services/v1/notifications';
import { v1ScheduleToUi, type UiSchedule } from '../../services/v1/adapters';
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

type Schedule = UiSchedule;

export const StudentDashboard: React.FC = () => {
  const { currentUser, currentCollege, buses, routes, notifications, markNotificationsRead, isLoadingData } = useApp();
  const routeNameById = new Map(routes.map((r) => [r.id, r.name]));
  const busNumberById = new Map(buses.map((b) => [b.id, b.busNumber]));

  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');
  const [selectedBusId, setSelectedBusId] = useState<string | undefined>(undefined);
  const [scheduleRecords, setScheduleRecords] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [scheduleError, setScheduleError] = useState(false);
  const [scheduleReload, setScheduleReload] = useState(0);
  const [clock, setClock] = useState(Date.now);

  useEffect(() => {
    let mounted = true;
    setLoadingSchedules(true);
    setScheduleError(false);
    void allPages(page => schedulesV1.list(undefined, undefined, true, page))
      .then(rows => { if (mounted) setScheduleRecords(rows.map(v1ScheduleToUi)); })
      .catch(() => { if (mounted) setScheduleError(true); })
      .finally(() => { if (mounted) setLoadingSchedules(false); });
    return () => { mounted = false; };
  }, [scheduleReload]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: currentCollege.timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(clock);
  const part = (type: Intl.DateTimeFormatPartTypes) => local.find(item => item.type === type)?.value;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days.indexOf(part('weekday') ?? '');
  const nowTime = `${part('hour')}:${part('minute')}`;
  const upcomingSchedules = scheduleRecords.flatMap(schedule => {
    if (selectedRouteId !== 'ALL' && schedule.route_id !== selectedRouteId) return [];
    for (let offset = 0; offset <= 7; offset++) {
      const day = days[(today + offset) % 7];
      if (schedule.operating_days.includes(day) && (offset > 0 || schedule.departure_time >= nowTime)) {
        return [{ ...schedule, day, offset }];
      }
    }
    return [];
  }).sort((a, b) => a.offset - b.offset || a.departure_time.localeCompare(b.departure_time)).slice(0, 4);
  const enrichedActiveBuses = useLiveBuses(buses).filter(bus => bus.activeTripId);
  const activeBuses = enrichedActiveBuses;

  // Display active operating buses with live telemetry on the map
  const displayedBuses = enrichedActiveBuses.filter((b) =>
    selectedRouteId === 'ALL' ? true : b.currentRouteId === selectedRouteId
  );

  const selectedBus =
    displayedBuses.find((b) => b.id === selectedBusId) ||
    displayedBuses[0];

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const selectedBusRoute = routes.find((r) => r.id === selectedBus?.currentRouteId);

  // Time since GPS update helper
  const estimate = estimateArrivalSeconds(selectedBus, selectedBusRoute);

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
    markNotificationsRead([id]);
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
      <div className="bg-blue-900 text-white rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-700/60 border border-blue-500/40 text-[11px] font-semibold text-blue-100 mb-2">
              <span>Campus Transit • {currentCollege.campusName}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Live Shuttle Tracker{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}
            </h2>
            <p className="text-xs text-blue-100 mt-1">
              {activeBuses.length > 0
                ? `${activeBuses.length} campus shuttle${activeBuses.length !== 1 ? 's' : ''} currently running.`
                : 'No buses are currently running. Check the next scheduled departure.'}
            </p>
          </div>

          {/* Route Selector Dropdown */}
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 shrink-0">
            <label htmlFor="student-dashboard-route" className="block text-[11px] font-bold uppercase tracking-wider text-blue-200 mb-1">
              Filter by Line
            </label>
            <select id="student-dashboard-route"
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
                    {r.code} — {r.name} {count > 0 ? `(${count} active)` : ''}
                  </option>
                );
              })}
            </select>
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
                <h3 className="text-sm font-bold text-slate-900">Next scheduled departures</h3>
                <p className="text-xs text-slate-500">Campus local time</p>
              </div>
            </div>
            <Link
              to="/student/schedules"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Full schedule <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {scheduleError ? (
            <p role="alert" className="text-sm text-amber-900">Could not load the schedule. <button onClick={() => setScheduleReload(n => n + 1)} className="min-h-11 underline">Retry</button></p>
          ) : loadingSchedules ? (
            <div className="py-8 text-center text-xs text-slate-600">Loading schedules...</div>
          ) : upcomingSchedules.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {upcomingSchedules.map((s) => (
                <div key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Route {routeNameById.get(s.route_id) ?? 'Unknown route'}</span>
                    <span className="text-slate-600 ml-2">Vehicle {busNumberById.get(s.bus_id) ?? 'Unknown vehicle'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-bold text-slate-800 font-mono">{s.offset === 0 ? 'Today' : s.offset === 1 ? 'Tomorrow' : s.day} {s.departure_time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-600 italic">
              No departures scheduled.
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
            <div className="py-6 text-center text-xs text-slate-600 italic">
              No new transit notices at this time.
            </div>
          )}
        </div>
      </div>
      {/* Primary Feature: Interactive Map with Bus Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real Interactive Map */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <MapView center={[currentCollege.centerLocation.lat, currentCollege.centerLocation.lng]} zoom={currentCollege.defaultZoom}
              buses={displayedBuses}
              routes={selectedRouteId === 'ALL' ? routes : routes.filter((r) => r.id === selectedRouteId)}
              selectedBusId={selectedBus?.id}
              selectedRouteId={selectedRouteId !== 'ALL' ? selectedRouteId : undefined}
              onSelectBus={(b) => setSelectedBusId(b.id)}
              heightClass={displayedBuses.length ? "h-[380px] sm:h-[480px]" : "h-[180px] sm:h-[225px]"}
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
                      <span className={`w-1.5 h-1.5 rounded-full ${bus.canTrack && bus.lastLocation && bus.trackingStatus === 'LIVE' && !bus.isSimulated ? 'bg-emerald-500' : 'bg-amber-400'}`} />
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
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
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
                <div className="text-xs text-slate-600 italic">No assigned route</div>
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
                      return 'Unavailable';
                    })()}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Arrival ETA
                  </div>
                  <div className="mt-1">
                    <ETAIndicator
                      seconds={estimate}
                      confidence={estimate == null ? 'OFFLINE' : 'DEGRADED'}
                    />
                  </div>
                </div>
              </div>

              {/* Occupancy Indicator */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                {selectedBus.hasOccupancy ? <OccupancyIndicator current={selectedBus.currentOccupancy} capacity={selectedBus.capacity} /> : <p className="text-xs text-slate-600">Passenger count unavailable</p>}
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
                    <Compass className="w-3.5 h-3.5 text-slate-600" /> Speed:
                  </span>
                  <span className="font-bold text-slate-800">{selectedBus.speedKmh == null ? 'Unavailable' : `${selectedBus.speedKmh} km/h`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-600" /> Coordinates:
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
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <BusIcon className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-slate-800">No Bus Selected</h4>
              <p className="text-xs text-slate-500">
                Select an active bus on the map or choose a route to view live arrival times and occupancy.
              </p>
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
