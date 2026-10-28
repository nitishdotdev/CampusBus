import React, { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { EmptyState } from '../../components/common/States';
import { apiClient } from '../../services/apiClient';
import { BarChart3, AlertCircle, Loader2 } from 'lucide-react';

interface AnalyticsPayload {
  fleetSize?: number;
  routesCount?: number;
  completedTripsToday?: number;
  completedTripsTotal?: number;
  totalDistanceCoveredKm?: number;
  onTimeRatePercent?: number | null;
  gpsReliabilityPercent?: number | null;
  totalPassengers?: number | null;
}

export const AdminAnalytics: React.FC = () => {
  const { buses, routes, trips } = useApp();
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiClient.get<AnalyticsPayload>('/api/analytics')
      .then((data) => {
        if (mounted) setAnalytics(data || null);
      })
      .catch((err: any) => {
        if (mounted) setError(err?.message || 'Failed to load analytics.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const completedTrips = trips.filter((t) => t.status === 'COMPLETED');
  const activeTrips = trips.filter((t) => t.status === 'IN_PROGRESS').length;
  const metric = (value: number | null | undefined, suffix = '') =>
    value === null || value === undefined ? '—' : `${value}${suffix}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Transit Analytics</h2>
        <p className="text-xs text-slate-500">Metrics derived from stored trips, buses, and routes</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics…
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-2 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase">Fleet Size</div>
            <div className="text-2xl font-black text-slate-900 mt-2">{analytics?.fleetSize ?? buses.length}</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase">Completed Today</div>
            <div className="text-2xl font-black text-emerald-600 mt-2">{analytics?.completedTripsToday ?? 0}</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase">Active Now</div>
            <div className="text-2xl font-black text-blue-600 mt-2">{activeTrips}</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase">Distance Logged</div>
            <div className="text-2xl font-black text-indigo-600 mt-2">
              {analytics?.totalDistanceCoveredKm != null ? `${analytics.totalDistanceCoveredKm.toFixed(1)} km` : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">On-time rate</div>
          <div className="text-xl font-black text-slate-900 mt-2">{metric(analytics?.onTimeRatePercent, '%')}</div>
          <p className="text-[11px] text-slate-500 mt-1">Shown only when measured from stored trips</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">GPS reliability</div>
          <div className="text-xl font-black text-slate-900 mt-2">{metric(analytics?.gpsReliabilityPercent, '%')}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Passengers</div>
          <div className="text-xl font-black text-slate-900 mt-2">{metric(analytics?.totalPassengers)}</div>
        </div>
      </div>

      {completedTrips.length === 0 && buses.length === 0 ? (
        <EmptyState
          title="No trip data yet"
          description="Trip data and analytics will appear here once buses start running trips."
          icon={BarChart3}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Completed Trips</h3>
          {completedTrips.length === 0 ? (
            <p className="text-xs text-slate-500">No completed trips yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Trip</th>
                    <th className="py-2 px-3">Route</th>
                    <th className="py-2 px-3">Started</th>
                    <th className="py-2 px-3">Ended</th>
                    <th className="py-2 px-3">Distance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedTrips.slice(0, 10).map((trip) => {
                    const route = routes.find((r) => r.id === trip.routeId);
                    return (
                      <tr key={trip.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-slate-600">{trip.id.slice(0, 12)}...</td>
                        <td className="py-2.5 px-3 font-semibold">
                          {route ? <span>{route.code}</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-2.5 px-3">{new Date(trip.startTime).toLocaleString()}</td>
                        <td className="py-2.5 px-3">{trip.endTime ? new Date(trip.endTime).toLocaleString() : '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{trip.distanceCoveredKm.toFixed(1)} km</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
