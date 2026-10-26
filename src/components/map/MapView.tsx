import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Bus, Route, Stop } from '../../types';

interface MapViewProps {
  buses: Bus[];
  routes: Route[];
  selectedBusId?: string;
  selectedRouteId?: string;
  onSelectBus?: (bus: Bus) => void;
  onSelectStop?: (stop: Stop) => void;
  center?: [number, number];
  zoom?: number;
  heightClass?: string;
  className?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  buses, routes, selectedBusId, selectedRouteId, onSelectBus, onSelectStop,
  center = [34.0537, -118.2570], zoom = 15, heightClass = 'h-[500px]', className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const busMarkersRef = useRef<Record<string, L.Marker>>({});
  const routeLayersRef = useRef<Record<string, L.Polyline>>({});
  const stopMarkersRef = useRef<Record<string, L.Marker>>({});

  const activeBusCount = buses.filter((b) => b.status === 'ACTIVE').length;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, { center, zoom, zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, subdomains: 'abcd',
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapInstanceRef.current = map;
    }
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    Object.values(routeLayersRef.current).forEach((p) => map.removeLayer(p));
    routeLayersRef.current = {};
    routes.forEach((route) => {
      const isSelected = selectedRouteId === route.id;
      const opacity = selectedRouteId ? (isSelected ? 0.9 : 0.25) : 0.7;
      const weight = isSelected ? 5 : 3.5;
      const polyline = L.polyline(route.pathCoordinates, {
        color: route.color, weight, opacity, lineCap: 'round', lineJoin: 'round',
      }).addTo(map);
      polyline.bindTooltip(`<div class="font-bold text-xs">${route.code} — ${route.name}</div>`, { sticky: true });
      routeLayersRef.current[route.id] = polyline;
    });
  }, [routes, selectedRouteId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    Object.values(stopMarkersRef.current).forEach((m) => map.removeLayer(m));
    stopMarkersRef.current = {};
    const stopsMap = new Map<string, Stop>();
    routes.forEach((r) => r.stops.forEach((s) => { if (!stopsMap.has(s.id)) stopsMap.set(s.id, s); }));
    stopsMap.forEach((stop) => {
      const stopIcon = L.divIcon({
        className: 'custom-stop-icon',
        html: `<div class="relative flex items-center justify-center cursor-pointer"><div class="w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-700 shadow-md"></div></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map);
      marker.bindTooltip(`<div class="text-xs font-semibold text-slate-900">${stop.name}</div>`, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => { if (onSelectStop) onSelectStop(stop); });
      stopMarkersRef.current[stop.id] = marker;
    });
  }, [routes, onSelectStop]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const currentBusIds = new Set(buses.map((b) => b.id));
    Object.keys(busMarkersRef.current).forEach((id) => {
      if (!currentBusIds.has(id)) { map.removeLayer(busMarkersRef.current[id]); delete busMarkersRef.current[id]; }
    });
    buses.forEach((bus) => {
      if (bus.status === 'OFFLINE' || bus.status === 'MAINTENANCE') {
        if (busMarkersRef.current[bus.id]) { map.removeLayer(busMarkersRef.current[bus.id]); delete busMarkersRef.current[bus.id]; }
        return;
      }
      if (!bus.lastLocation || typeof bus.lastLocation.lat !== 'number' || typeof bus.lastLocation.lng !== 'number') {
        return;
      }
      const isSelected = selectedBusId === bus.id;
      const lat = bus.lastLocation.lat, lng = bus.lastLocation.lng;
      const heading = bus.heading || 0;
      const route = routes.find((r) => r.id === bus.currentRouteId);
      const routeColor = route ? route.color : '#2563EB';
      const statusColor = bus.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500';
      const busIconHtml = `<div class="relative flex flex-col items-center cursor-pointer"><div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md mb-0.5 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : ''}" style="background-color: ${routeColor};"><span class="w-1.5 h-1.5 rounded-full ${statusColor}"></span><span>${bus.busNumber}</span></div><div class="w-7 h-7 rounded-full bg-white shadow-lg border-2 border-slate-800 flex items-center justify-center ${isSelected ? 'scale-115' : ''}"><div style="transform: rotate(${heading}deg);" class="transition-transform duration-500"><svg class="w-4 h-4 text-blue-600 fill-current" viewBox="0 0 24 24"><polygon points="12,2 22,22 12,17 2,22" /></svg></div></div></div>`;
      const customIcon = L.divIcon({ className: 'bus-marker-wrapper', html: busIconHtml, iconSize: [50, 48], iconAnchor: [25, 40] });
      if (busMarkersRef.current[bus.id]) {
        busMarkersRef.current[bus.id].setLatLng([lat, lng]).setIcon(customIcon);
      } else {
        const marker = L.marker([lat, lng], { icon: customIcon, zIndexOffset: 100 }).addTo(map);
        marker.on('click', () => { if (onSelectBus) onSelectBus(bus); });
        busMarkersRef.current[bus.id] = marker;
      }
    });
  }, [buses, routes, selectedBusId, onSelectBus]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (selectedBusId) {
      const bus = buses.find((b) => b.id === selectedBusId);
      if (bus?.lastLocation) map.flyTo([bus.lastLocation.lat, bus.lastLocation.lng], 16, { duration: 0.8 });
    } else if (selectedRouteId) {
      const route = routes.find((r) => r.id === selectedRouteId);
      if (route && route.pathCoordinates.length > 0) map.fitBounds(L.latLngBounds(route.pathCoordinates), { padding: [50, 50] });
    }
  }, [selectedBusId, selectedRouteId]);

  return (
    <div className={`relative w-full ${heightClass} ${className} rounded-2xl overflow-hidden border border-slate-200 shadow-sm`}>
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-1.5 text-[11px] text-slate-700 max-w-[200px]">
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
          <span>Campus Fleet</span>
          {activeBusCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
        </div>
        {routes.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-white shadow-sm shrink-0" style={{ backgroundColor: r.color }} />
            <span className="truncate">{r.code}</span>
          </div>
        ))}
        {routes.length === 0 && <span className="text-slate-400 italic">No routes defined</span>}
      </div>
    </div>
  );
};
