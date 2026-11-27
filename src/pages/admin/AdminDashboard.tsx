import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { alertsV1 } from '../../services/v1/notifications';
import { BusStatusBadge } from '../../components/common/StatusBadges';
import { EmptyState } from '../../components/common/States';
import { Bus as BusIcon, Navigation, ShieldAlert, Users, Activity, CheckCircle2, ArrowRight } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { currentCollege, buses, routes, emergencyAlerts, refreshData, isLoadingData } = useApp();

  const activeBuses = buses.filter(bus => bus.activeTripId);
  const available = buses.filter(bus => bus.operationalStatus === 'ACTIVE' && !bus.activeTripId);
  const live = activeBuses.filter(bus => bus.trackingStatus === 'LIVE' && !bus.isSimulated);
  const activeAlerts = emergencyAlerts.filter(alert => alert.status === 'ACTIVE');
  const [error, setError] = React.useState('');

  const updateAlert = async (id: string, action: 'acknowledge' | 'resolve') => {
    setError('');
    try {
      await alertsV1[action](id);
      await refreshData();
    } catch {
      setError('Could not update the alert. Refresh to check its current status.');
    }
  };

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 h-24" />
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {currentCollege.name} Fleet Overview
          </h2>
          <p className="text-xs text-slate-500">Real-time campus shuttle monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/fleet" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors">
            <Navigation className="w-4 h-4" /> Live Fleet Map
          </Link>
        </div>
      </div>

      {/* Emergency Banner */}
      {activeAlerts.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-rose-950">{activeAlerts.length} Active Emergency</h4>
                <p className="text-xs text-rose-700">Immediate review needed</p>
              </div>
            </div>
            <Link to="/admin/alerts" className="text-xs font-bold text-rose-800 hover:text-rose-950 underline">Manage</Link>
          </div>
          {activeAlerts.map((alert) => (
            <div key={alert.id} className="bg-white p-3.5 rounded-xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-slate-900">Bus {alert.busNumber} • {alert.routeName} • {alert.reason}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">Driver: {alert.driverName} • {new Date(alert.timestamp).toLocaleTimeString()}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => void updateAlert(alert.id, 'acknowledge')} className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg text-xs cursor-pointer">Acknowledge</button>
                <button onClick={() => void updateAlert(alert.id, 'resolve')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer">Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Available vehicles</span>
            <span className="p-2 rounded-lg bg-blue-50 text-blue-600"><BusIcon className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2 font-mono">
            {available.length}<span className="text-sm font-semibold text-slate-600">/{buses.length}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {buses.length === 0 ? 'No buses configured' : `${buses.filter(bus => bus.operationalStatus === 'MAINTENANCE').length} in maintenance`}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Live tracking</span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Users className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2 font-mono">
            {live.length}<span className="text-sm font-semibold text-slate-600">/{activeBuses.length}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {activeBuses.length ? `${activeBuses.length - live.length} with limited tracking` : 'No active trips'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Active Trips</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600"><Activity className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 mt-2 font-mono">{activeBuses.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">{routes.filter((r) => r.status === 'LIVE').length} routes live</p>
        </div>

        <div className={`bg-white p-5 rounded-2xl border ${activeAlerts.length > 0 ? 'border-2 border-rose-500' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Emergencies</span>
            <span className={`p-2 rounded-lg ${activeAlerts.length > 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-emerald-50 text-emerald-600'}`}>
              {activeAlerts.length > 0 ? <ShieldAlert className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </span>
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-2 font-mono ${activeAlerts.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{activeAlerts.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">{activeAlerts.length > 0 ? 'Action required' : 'All clear'}</p>
        </div>
      </div>

      {/* Fleet Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Fleet Status</h3>
            <p className="text-xs text-slate-500">Vehicle availability and tracking</p>
          </div>
          <Link to="/admin/buses" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">Manage <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>

        {buses.length === 0 ? (
          <div className="p-8">
            <EmptyState title="No buses configured" description="Add buses to the fleet to start tracking them." icon={BusIcon} actionLabel="Add Bus" onAction={() => {}} />
          </div>
        ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Fleet status table">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Bus</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Occupancy</th>
                  <th className="py-3 px-4">GPS</th>
                  <th className="py-3 px-4">Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {buses.map((bus) => {
                  const route = routes.find((r) => r.id === bus.currentRouteId);
                  return (
                    <tr key={bus.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">{bus.busNumber.split('-')[1] || bus.busNumber}</div>
                          <div>
                            <div>{bus.busNumber}</div>
                            <div className="text-[10px] text-slate-600">{bus.model}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4"><BusStatusBadge status={bus.status} /></td>
                      <td className="py-3.5 px-4 font-semibold">
                        {route ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: route.color }} />
                            <span>{route.code}</span>
                          </div>
                        ) : <span className="text-slate-600">Unassigned</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono">{bus.hasOccupancy ? `${bus.currentOccupancy}/${bus.capacity}` : 'Unavailable'}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${bus.gpsStatus === 'GPS_ACTIVE' ? 'text-emerald-700' : 'text-amber-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${bus.gpsStatus === 'GPS_ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                          {bus.gpsStatus === 'GPS_ACTIVE' ? 'Active' : bus.gpsStatus === 'LOCATION_STALE' ? 'Stale' : 'Unavailable'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">{bus.speedKmh == null ? 'Unavailable' : `${bus.speedKmh} km/h`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
