import React from 'react';
import { useApp } from '../../store/AppContext';
import { EmptyState } from '../../components/common/States';
import { BarChart3 } from 'lucide-react';

export const AdminAnalytics: React.FC = () => {
  const { buses, routes, trips } = useApp();

  const completedTrips = trips.filter((t) => t.status === 'COMPLETED');
  const activeTrips = buses.filter(bus => bus.activeTripId).length;
  const totalTrips = trips.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Transit Analytics</h2>
        <p className="text-xs text-slate-500">Activity from the latest 100 trips and the current fleet</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Recent Trips</div>
          <div className="text-2xl font-black text-slate-900 mt-2">{totalTrips}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Recent Completed</div>
          <div className="text-2xl font-black text-emerald-600 mt-2">{completedTrips.length}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Active Now</div>
          <div className="text-2xl font-black text-blue-600 mt-2">{activeTrips}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Fleet Size</div>
          <div className="text-2xl font-black text-indigo-600 mt-2">{buses.length}</div>
        </div>
      </div>

      {totalTrips === 0 && buses.length === 0 ? (
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
            <div className="overflow-x-auto" role="region" aria-label="Recent completed trips table" tabIndex={0}>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Trip</th>
                    <th className="py-2 px-3">Route</th>
                    <th className="py-2 px-3">Started</th>
                    <th className="py-2 px-3">Ended</th>
                    <th className="py-2 px-3">GPS fixes</th>
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
                        <td className="py-2.5 px-3 font-mono">{trip.totalLocationsLogged}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {routes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Completed Trips by Route in This Sample</h3>
          <div className="space-y-3">
            {routes.map((route) => {
              const routeTrips = trips.filter((t) => t.routeId === route.id);
              const routeCompleted = routeTrips.filter((t) => t.status === 'COMPLETED').length;
              return (
                <div key={route.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: route.color }} />
                    <span className="font-bold text-slate-900">{route.code}</span>
                    <span className="text-slate-500">{route.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-600">
                    <span>{routeCompleted} trips</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
