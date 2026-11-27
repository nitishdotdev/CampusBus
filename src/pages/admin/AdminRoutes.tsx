import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Link } from 'react-router-dom';
import { RouteStatusBadge } from '../../components/common/StatusBadges';
import { Modal } from '../../components/common/Modals';
import { routesV1 } from '../../services/v1/routes';
import { ApiV1Error } from '../../services/v1/client';
import type { Route } from '../../types';
import { Plus, MapPin } from 'lucide-react';

export const AdminRoutes: React.FC = () => {
  const { routes, buses, refreshData } = useApp();
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || '');
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [draftStops, setDraftStops] = useState<{ key: number; name: string; lat: string; lng: string }[]>([]);
  const stopKey = React.useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  const openRouteForm = (route: Route | null) => {
    setEditingRoute(route);
    setCode(route?.code ?? '');
    setName(route?.name ?? '');
    setColor(route?.color ?? '#2563EB');
    setDraftStops(route?.stops.map(stop => ({ key: stopKey.current++, name: stop.name, lat: String(stop.lat), lng: String(stop.lng) })) ?? []);
    setError('');
    setIsRouteModalOpen(true);
  };

  const moveStop = (index: number, offset: number) => {
    setDraftStops(stops => {
      const next = [...stops];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  };

  const handleSaveRoute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const details = { code: code.trim().toUpperCase(), name: name.trim(), color };
      const stops = draftStops.map((stop, order) => ({ name: stop.name.trim(), lat: Number(stop.lat), lng: Number(stop.lng), order }));
      const stopsChanged = editingRoute && (stops.length !== editingRoute.stops.length || stops.some((stop, index) => {
        const original = editingRoute.stops[index];
        return stop.name !== original.name || stop.lat !== original.lat || stop.lng !== original.lng;
      }));
      const route = editingRoute
        ? await routesV1.update(editingRoute.id, { ...details, ...(stopsChanged ? { stops } : {}) })
        : await routesV1.create({ ...details, stops });
      setSelectedRouteId(route.id);
      setIsRouteModalOpen(false);
      await refreshData();
    } catch (err) {
      const messages: Record<string, string> = {
        ROUTE_CODE_TAKEN: 'A route already uses this code.',
        ROUTE_HAS_ACTIVE_TRIP: 'Wait for active trips on this route to end before changing stops.',
      };
      setError((err instanceof ApiV1Error && err.code && messages[err.code]) || 'Could not save the route. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campus Route & Stop Management</h2>
          <p className="text-xs text-slate-500">
            Configure transit routes and the order of their stops
          </p>
        </div>

        <button
          onClick={() => openRouteForm(null)}
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
              <button type="button" aria-pressed={isSelected}
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
                className={`block w-full text-left p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
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
              </button>
            );
          })}
        </div>

        {/* Right: Route Details & Stops */}
        {selectedRoute && (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
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

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => openRouteForm(selectedRoute)} className="min-h-11 text-xs font-semibold text-blue-700 underline">Edit route</button>
                <Link to="/admin/schedules" className="flex min-h-11 items-center text-xs font-semibold text-blue-700 underline">Manage schedules</Link>
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
                          {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
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

      <Modal
        isOpen={isRouteModalOpen}
        onClose={() => { if (!saving) setIsRouteModalOpen(false); }}
        title={editingRoute ? 'Edit Campus Route' : 'Create New Campus Route'}
      >
        <form onSubmit={handleSaveRoute} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="route-code" className="block text-xs font-bold text-slate-700 mb-1">Route Code *</label>
              <input
                id="route-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. YL-04"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label htmlFor="route-color" className="block text-xs font-bold text-slate-700 mb-1">Route Color</label>
              <div className="flex items-center gap-2">
                <input
                  id="route-color" type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <span className="text-xs font-mono text-slate-600">{color}</span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="route-name" className="block text-xs font-bold text-slate-700 mb-1">Route Name *</label>
            <input
              id="route-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yellow Stadium Shuttle"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-slate-700">Stops in service order</legend>
            {draftStops.map((stop, index) => (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2" key={stop.key}>
                <input className="col-span-2 min-w-0 rounded border p-2 text-sm" required maxLength={120} aria-label={`Stop ${index + 1} name`} placeholder="Stop name"
                  value={stop.name} onChange={event => setDraftStops(draftStops.map(item => item.key === stop.key ? { ...item, name: event.target.value } : item))} />
                <input className="min-w-0 rounded border p-2 text-sm" type="number" step="any" min={-90} max={90} required aria-label={`Stop ${index + 1} latitude`} placeholder="Latitude"
                  value={stop.lat} onChange={event => setDraftStops(draftStops.map(item => item.key === stop.key ? { ...item, lat: event.target.value } : item))} />
                <input className="min-w-0 rounded border p-2 text-sm" type="number" step="any" min={-180} max={180} required aria-label={`Stop ${index + 1} longitude`} placeholder="Longitude"
                  value={stop.lng} onChange={event => setDraftStops(draftStops.map(item => item.key === stop.key ? { ...item, lng: event.target.value } : item))} />
                <div className="col-span-2 flex flex-wrap gap-x-3 text-xs font-semibold">
                  <button type="button" disabled={index === 0} aria-label={`Move stop ${index + 1} up`} className="min-h-11 text-blue-700 disabled:text-slate-500" onClick={() => moveStop(index, -1)}>Move up</button>
                  <button type="button" disabled={index === draftStops.length - 1} aria-label={`Move stop ${index + 1} down`} className="min-h-11 text-blue-700 disabled:text-slate-500" onClick={() => moveStop(index, 1)}>Move down</button>
                  <button type="button" className="min-h-11 text-rose-700" onClick={() => setDraftStops(draftStops.filter(item => item.key !== stop.key))}>Remove stop {index + 1}</button>
                </div>
              </div>
            ))}
            <button type="button" disabled={draftStops.length >= 100} className="min-h-11 text-xs font-semibold text-blue-700 underline"
              onClick={() => setDraftStops([...draftStops, { key: stopKey.current++, name: '', lat: '', lng: '' }])}>Add stop</button>
          </fieldset>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={saving} onClick={() => setIsRouteModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
            >
              {editingRoute ? 'Save Route' : 'Create Route'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
