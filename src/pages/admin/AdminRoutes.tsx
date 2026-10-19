import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Route, Stop } from '../../types';
import { RouteStatusBadge } from '../../components/common/StatusBadges';
import { Modal } from '../../components/common/Modals';
import { adminService } from '../../services/adminService';
import { routesV1 } from '../../services/v1/routes';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';
import {
  Route as RouteIcon,
  Plus,
  MapPin,
  Clock,
  Bus,
  Trash2,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

export const AdminRoutes: React.FC = () => {
  const { routes, buses } = useApp();
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || 'route_blue');
  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false);

  // New Route Form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [scheduleHours, setScheduleHours] = useState('07:00 AM – 10:00 PM');
  const [frequencyMinutes, setFrequencyMinutes] = useState(10);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    // Default basic stop sequence for new campus route
    const defaultStops: Stop[] = [
      {
        id: `stop_${Date.now()}_1`,
        collegeId: 'college_apex',
        code: `${code}-01`,
        name: `${name} Terminal`,
        lat: 34.0537,
        lng: -118.2570,
        landmark: 'Main Station Gate',
        sequence: 1,
      },
      {
        id: `stop_${Date.now()}_2`,
        collegeId: 'college_apex',
        code: `${code}-02`,
        name: `${name} East Quad`,
        lat: 34.0545,
        lng: -118.2585,
        landmark: 'Academic Plaza',
        sequence: 2,
      },
      {
        id: `stop_${Date.now()}_3`,
        collegeId: 'college_apex',
        code: `${code}-03`,
        name: `${name} Residence Hall`,
        lat: 34.0560,
        lng: -118.2610,
        landmark: 'North Commons',
        sequence: 3,
      },
    ];

    const defaultCoords: [number, number][] = [
      [34.0537, -118.2570],
      [34.0545, -118.2585],
      [34.0560, -118.2610],
      [34.0537, -118.2570],
    ];

    if (USE_V1) {
      await routesV1.create({
        code: code.toUpperCase(),
        name,
        color,
        stops: defaultStops.map((s, i) => ({
          id: '', name: s.name, lat: s.lat, lng: s.lng, order: i,
        })),
      });
    } else {
      adminService.addRoute({
        collegeId: 'college_apex',
        code: code.toUpperCase(),
        name,
        description: description || `Campus line connecting ${name}`,
        color,
        status: 'SCHEDULED',
        scheduleHours,
        frequencyMinutes: Number(frequencyMinutes) || 12,
        stops: defaultStops,
        pathCoordinates: defaultCoords,
      });
    }

    setIsAddRouteModalOpen(false);
    setCode('');
    setName('');
    setDescription('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campus Route & Stop Management</h2>
          <p className="text-xs text-slate-500">
            Define transit corridors, frequency headways, and ordered stop sequences
          </p>
        </div>

        <button
          onClick={() => setIsAddRouteModalOpen(true)}
          className="self-start sm:self-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Campus Line</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Routes List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Configured Routes ({routes.length})
          </h3>
          {routes.map((route) => {
            const isSelected = selectedRoute?.id === route.id;
            const busesOnRoute = buses.filter((b) => b.currentRouteId === route.id).length;

            return (
              <div
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
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

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span>{route.stops.length} designated stops</span>
                  <span className="font-semibold text-slate-700">{busesOnRoute} buses assigned</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Route Details & Stops */}
        {selectedRoute && (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
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

              <div className="text-right text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div>
                  <strong>Hours:</strong> {selectedRoute.scheduleHours}
                </div>
                <div>
                  <strong>Interval:</strong> Every {selectedRoute.frequencyMinutes}m
                </div>
              </div>
            </div>

            {/* Ordered Stop Manager */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Ordered Sequence Stops ({selectedRoute.stops.length})
                </h4>
              </div>

              <div className="space-y-2">
                {selectedRoute.stops.map((stop, idx) => (
                  <div
                    key={`${stop.id}-${idx}`}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{stop.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-white rounded border border-slate-200 text-slate-500">
                            {stop.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {stop.landmark} • [{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}]
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Route Modal */}
      <Modal
        isOpen={isAddRouteModalOpen}
        onClose={() => setIsAddRouteModalOpen(false)}
        title="Create New Campus Route"
      >
        <form onSubmit={handleCreateRoute} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Route Code *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. YL-04"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Route Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <span className="text-xs font-mono text-slate-600">{color}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Route Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yellow Stadium Shuttle"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of stops and coverage..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Operating Hours</label>
              <input
                type="text"
                value={scheduleHours}
                onChange={(e) => setScheduleHours(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Frequency (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                value={frequencyMinutes}
                onChange={(e) => setFrequencyMinutes(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddRouteModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
            >
              Create Route
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
