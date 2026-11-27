import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Link } from 'react-router-dom';
import { useLiveBuses } from '../../hooks/useLiveBuses';
import { estimateArrivalSeconds } from '../../services/arrivalEstimate';
import { RouteStatusBadge, ETAIndicator } from '../../components/common/StatusBadges';
import {
  Route as RouteIcon,
  MapPin,
  Clock,
  Bus as BusIcon,
  ChevronRight,
  Navigation,
  ShieldCheck,
} from 'lucide-react';

export const StudentRoutes: React.FC = () => {
  const { routes, buses } = useApp();
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id ?? '');

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
  const activeBusesOnRoute = useLiveBuses(buses).filter(
    (b) => b.status === 'ACTIVE' && b.currentRouteId === selectedRoute?.id
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Campus Transit Routes & Timetables</h2>
        <p className="text-xs text-slate-500">
          Official schedules, ordered sequence stops, and active bus positions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Route Selector List (Left Column) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            All Campus Lines
          </h3>
          {routes.map((route) => {
            const isSelected = selectedRoute?.id === route.id;
            const activeCount = buses.filter(
              (b) => b.status === 'ACTIVE' && b.currentRouteId === route.id
            ).length;

            return (
              <button type="button" aria-pressed={isSelected}
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
                className={`block w-full p-4 text-left rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: route.color }}
                    />
                    <h4 className="font-bold text-slate-900 text-sm">
                      {route.code} — {route.name}
                    </h4>
                  </div>
                  <RouteStatusBadge status={route.status} />
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{route.description}</p>

                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <BusIcon className="w-3.5 h-3.5 text-blue-600" />
                    {activeCount} {activeCount === 1 ? 'bus' : 'buses'} active
                  </span>
                  <span>{route.stops.length} stops</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Route Details & Stop Timeline (Right 2 Columns) */}
        {selectedRoute && (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: selectedRoute.color }}
                  />
                  <h3 className="text-lg font-black text-slate-900">
                    {selectedRoute.code}: {selectedRoute.name}
                  </h3>
                  <RouteStatusBadge status={selectedRoute.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{selectedRoute.description}</p>
              </div>

              <Link to="/student/schedules" className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-800 underline">
                View timetable
              </Link>
            </div>

            {/* Active buses operating right now */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Active Vehicles Assigned to Route
              </h4>
              {activeBusesOnRoute.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeBusesOnRoute.map((bus) => {
                    const estimate = estimateArrivalSeconds(bus, selectedRoute);
                    return (
                    <div
                      key={bus.id}
                      className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          <BusIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">{bus.busNumber}</div>
                          <div className="text-[10px] text-slate-500">
                            {bus.hasOccupancy ? `Occupancy: ${bus.currentOccupancy}/${bus.capacity}` : 'Occupancy unavailable'}
                          </div>
                        </div>
                      </div>
                      <ETAIndicator
                        seconds={estimate}
                        confidence={estimate == null ? 'OFFLINE' : 'DEGRADED'}
                        size="sm"
                      />
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                  No vehicles are running on this route.
                </div>
              )}
            </div>

            {/* Ordered Stop Timeline */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Campus stops in route order
              </h4>

              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {selectedRoute.stops.map((stop, index) => {
                  const isFirst = index === 0;
                  const isLast = index === selectedRoute.stops.length - 1;

                  return (
                    <div key={`${stop.id}-${index}`} className="relative group">
                      {/* Stop Marker Node */}
                      <div
                        className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-transform group-hover:scale-125 ${
                          isFirst || isLast
                            ? 'border-blue-600 ring-2 ring-blue-100'
                            : 'border-slate-600'
                        }`}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: selectedRoute.color }}
                        />
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 hover:bg-slate-100/70 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{stop.name}</span>

                            </div>
                            {stop.landmark && (
                              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {stop.landmark}
                              </p>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
