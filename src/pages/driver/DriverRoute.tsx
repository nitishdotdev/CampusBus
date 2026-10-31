import React, { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { apiClient } from '../../services/apiClient';
import { MapView } from '../../components/map/MapView';
import { EmptyState } from '../../components/common/States';
import { Route as RouteIcon, MapPin, Bus, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

export const DriverRoute: React.FC = () => {
  const { currentUser, routes, buses, activeTrip } = useApp();
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAssignment = async () => {
      try {
        if (USE_V1) {
          const assigned = buses.find((b) => b.currentDriverId === currentUser?.id);
          if (isMounted) {
            setAssignment(assigned
              ? { busId: assigned.id, routeId: assigned.currentRouteId }
              : null);
          }
        } else {
          const res = await apiClient.get<any>('/api/driver/assignments');
          if (isMounted && res?.assignment) {
            setAssignment(res.assignment);
          }
        }
      } catch (err) {
        console.warn('Could not load driver assignment:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchAssignment();
    return () => {
      isMounted = false;
    };
  }, [buses, currentUser?.id]);

  const assignedBus =
    buses.find((b) => b.id === activeTrip?.busId) ||
    (assignment?.busId ? buses.find((b) => b.id === assignment.busId) : null) ||
    buses.find((b) => b.currentDriverId === currentUser?.id);

  const assignedRoute =
    routes.find((r) => r.id === (activeTrip?.routeId || assignment?.routeId || assignedBus?.currentRouteId));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-6 h-48" />
      </div>
    );
  }

  if (!assignedRoute || !assignedBus) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <EmptyState
          title="No Route Assigned"
          description="You do not currently have an active bus or route assignment. Please contact the campus transportation manager to assign a bus and route."
          icon={RouteIcon}
        />
      </div>
    );
  }

  const sortedStops = [...(assignedRoute.stops || [])].sort((a, b) => a.sequence - b.sequence);
  const completedStopIds = new Set(
    activeTrip?.completedStopIds || assignment?.completedStopIds || assignedBus.completedStopIds || []
  );
  const nextStopId = activeTrip?.nextStopId || assignment?.nextStopId || assignedBus.nextStopId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Route Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl text-white flex items-center justify-center font-black text-lg shadow-sm"
              style={{ backgroundColor: assignedRoute.color || '#2563EB' }}
            >
              {assignedRoute.code}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">{assignedRoute.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {assignedRoute.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Assigned Bus: <strong className="text-slate-800">{assignedBus.busNumber}</strong> ({assignedBus.model}) • Capacity: {assignedBus.capacity} seats
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Official Campus Transit Route</span>
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Route Map */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            Route Map &amp; Stops
          </h3>
          <span className="text-xs text-slate-500">
            {completedStopIds.size} of {sortedStops.length} stops arrived
          </span>
        </div>

        <MapView
          buses={assignedBus ? [{
            ...assignedBus,
            currentStopId: activeTrip?.currentStopId || assignment?.currentStopId || assignedBus.currentStopId,
            nextStopId,
            completedStopIds: Array.from(completedStopIds) as string[],
          }] : []}
          routes={[assignedRoute]}
          selectedRouteId={assignedRoute.id}
          selectedBusId={assignedBus.id}
          heightClass="h-[360px] sm:h-[420px]"
        />
      </div>

      {/* Ordered Stops List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Ordered Stop Sequence</h3>
            <p className="text-xs text-slate-500">
              Scheduled pickup and dropoff points in order of navigation.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600">
            {completedStopIds.size} / {sortedStops.length} Completed
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedStops.map((stop, idx) => {
            const isCompleted = completedStopIds.has(stop.id);
            const isNext = stop.id === nextStopId;

            return (
              <div
                key={stop.id}
                className={`py-3 px-2 rounded-xl transition-colors flex items-center justify-between text-xs ${
                  isNext
                    ? 'bg-blue-50/70 border border-blue-200'
                    : isCompleted
                    ? 'bg-emerald-50/50'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 font-mono ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isNext
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </span>
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{stop.name}</span>
                      {isNext && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse">
                          Next Stop
                        </span>
                      )}
                      {isCompleted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Arrived
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Lat: {stop.lat.toFixed(5)}, Lng: {stop.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Stop #{stop.sequence}</span>
              </div>
            );
          })}
          {sortedStops.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              No stop waypoints registered for this route.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
