import React from 'react';
import { useApp } from '../../store/AppContext';
import { Trip } from '../../types';
import { History, Clock, MapPin, Bus, CheckCircle2, TrendingUp } from 'lucide-react';

export const DriverHistory: React.FC = () => {
  const { trips, routes } = useApp();

  const completedTrips = trips.filter((t: Trip) => t.status === 'COMPLETED');

  const totalDistance = completedTrips.reduce((acc: number, t: Trip) => acc + (t.distanceCoveredKm || 0), 0);
  const avgDistance = completedTrips.length > 0 ? totalDistance / completedTrips.length : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Driver Shift Log & Trip History</h2>
        <p className="text-xs text-slate-500">
          Archived trip telemetry, route mileage, and passenger counts
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Completed Trips
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {completedTrips.length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Mileage Logged
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {totalDistance.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Avg. Trip Distance
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1 font-mono">
            {avgDistance === null ? '—' : <>{avgDistance.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span></>}
          </div>
        </div>
      </div>

      {/* Trips Timeline */}
      <div className="space-y-3">
        {completedTrips.map((trip: Trip) => {
          const route = routes.find((r) => r.id === trip.routeId);
          const start = new Date(trip.startTime);
          const end = trip.endTime ? new Date(trip.endTime) : new Date();
          const durationMins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

          return (
            <div
              key={trip.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm shrink-0">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {route ? `${route.code} — ${route.name}` : 'Campus Route'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Completed
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({durationMins}m)
                    </span>
                    <span>•</span>
                    <span>{trip.distanceCoveredKm || 12.4} km</span>
                    <span>•</span>
                    <span>{trip.syncedLocationsCount || 142} GPS pings</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                <div className="text-[11px] text-slate-400">Peak Occupancy</div>
                <div className="text-sm font-bold text-slate-800 font-mono">
                  {trip.currentOccupancy} passengers
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
