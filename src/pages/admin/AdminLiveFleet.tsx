import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { MapView } from '../../components/map/MapView';
import { BusStatusBadge } from '../../components/common/StatusBadges';
import { EmptyState } from '../../components/common/States';
import { adminService } from '../../services/adminService';
import { Bus as BusIcon, Navigation, Clock, Compass, Users, MapPin, CheckCircle2 } from 'lucide-react';

export const AdminLiveFleet: React.FC = () => {
  const { buses, routes } = useApp();
  const [selectedBusId, setSelectedBusId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [routeFilter, setRouteFilter] = useState<string>('ALL');

  const filteredBuses = buses.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
    if (routeFilter !== 'ALL' && b.currentRouteId !== routeFilter) return false;
    return true;
  });

  const selectedBus = buses.find((b) => b.id === selectedBusId) || filteredBuses[0];
  const selectedBusRoute = routes.find((r) => r.id === selectedBus?.currentRouteId);

  const handleStatusChange = (newStatus: string) => {
    if (!selectedBus) return;
    adminService.updateBusStatus(selectedBus.id, newStatus as any);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Fleet Operations Map</h2>
          <p className="text-xs text-slate-500">Live GPS fleet tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="IDLE">Idle</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OFFLINE">Offline</option>
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
            <option value="ALL">All Routes</option>
            {routes.map((r) => (<option key={r.id} value={r.id}>{r.code} - {r.name}</option>))}
          </select>
        </div>
      </div>

      {buses.length === 0 ? (
        <EmptyState title="No buses in fleet" description="Add buses to begin tracking." icon={BusIcon} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <MapView buses={filteredBuses} routes={routes} selectedBusId={selectedBusId}
              selectedRouteId={routeFilter !== 'ALL' ? routeFilter : undefined}
              onSelectBus={(b) => setSelectedBusId(b.id)} heightClass="h-[550px] sm:h-[620px]" />
          </div>
          <div className="space-y-4">
            {selectedBus ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><BusIcon className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{selectedBus.busNumber}</h3>
                      <p className="text-xs text-slate-500">{selectedBus.model} • {selectedBus.plateNumber}</p>
                    </div>
                  </div>
                  <BusStatusBadge status={selectedBus.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase block">Driver</span>
                    <span className="font-bold text-slate-900">{selectedBus.driverName || 'Unassigned'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase block">Line</span>
                    <span className="font-bold text-slate-900">{selectedBusRoute ? selectedBusRoute.code : 'None'}</span>
                  </div>
                </div>
                <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Compass className="w-4 h-4" />Coords:</span>
                    <span className="font-mono font-bold">{selectedBus.lastLocation.lat.toFixed(5)}, {selectedBus.lastLocation.lng.toFixed(5)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Navigation className="w-4 h-4" />Speed:</span>
                    <span className="font-mono font-bold">{selectedBus.speedKmh || 0} km/h</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Clock className="w-4 h-4" />Updated:</span>
                    <span className="font-semibold">{new Date(selectedBus.lastSyncTimestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Users className="w-4 h-4" />Load:</span>
                    <span className="font-bold">{selectedBus.currentOccupancy} / {selectedBus.capacity}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="flex items-center gap-1.5 text-slate-500"><MapPin className="w-4 h-4 text-blue-600" />Next Stop:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[150px]">
                      {(() => {
                        const nextId = selectedBus.nextStopId;
                        const matchingStop = nextId ? selectedBusRoute?.stops?.find((s) => s.id === nextId) : undefined;
                        if (matchingStop) return matchingStop.name;
                        if (
                          selectedBus.completedStopIds &&
                          selectedBusRoute?.stops?.length &&
                          selectedBus.completedStopIds.length >= selectedBusRoute.stops.length
                        ) {
                          return 'All Stops Arrived';
                        }
                        return selectedBusRoute?.stops?.[0]?.name ?? 'Standby';
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><CheckCircle2 className="w-4 h-4 text-emerald-600" />Progress:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {(selectedBus.completedStopIds?.length || 0)} / {(selectedBusRoute?.stops?.length || 0)} stops
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleStatusChange(selectedBus.status === 'ACTIVE' ? 'IDLE' : 'ACTIVE')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer">
                      {selectedBus.status === 'ACTIVE' ? 'Set Idle' : 'Activate'}
                    </button>
                    <button onClick={() => handleStatusChange(selectedBus.status === 'MAINTENANCE' ? 'IDLE' : 'MAINTENANCE')}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl transition-colors cursor-pointer">
                      {selectedBus.status === 'MAINTENANCE' ? 'Clear' : 'Maintenance'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500">Select a bus on the map.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
