import { useReducer } from 'react';
import { mapFollow } from './mapFollow';
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Route, Stop } from '../../types';
import { AlertCircle } from 'lucide-react';

interface MapViewProps {
  buses: Bus[];
  routes: Route[];
  selectedBusId?: string;
  selectedRouteId?: string;
  driverLocation?: { lat: number; lng: number; heading?: number; accuracy?: number };
  onSelectBus?: (bus: Bus) => void;
  onSelectStop?: (stop: Stop) => void;
  center?: [number, number];
  zoom?: number;
  heightClass?: string;
  className?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  buses,
  routes,
  selectedBusId,
  selectedRouteId,
  driverLocation,
  onSelectBus,
  onSelectStop,
  center = [0, 0],
  zoom = 4,
  heightClass = 'h-[500px]',
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const busMarkersRef = useRef<Record<string, L.Marker>>({});
  const routeLayersRef = useRef<Record<string, L.Polyline>>({});
  const stopMarkersRef = useRef<Record<string, L.Marker>>({});
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const driverAccuracyCircleRef = useRef<L.Circle | null>(null);
  const busAccuracyRef = useRef<Record<string, L.Circle>>({});
  const busesByIdRef = useRef<Map<string, Bus>>(new Map());
  const onSelectBusRef = useRef(onSelectBus);
  const [followMode, dispatchFollow] = useReducer(mapFollow, 'following');
  const followBus = followMode === 'following';
  const lastSelectedTargetRef = useRef<string | undefined>(undefined);

  const [tileError, setTileError] = useState(false);

  const hasLiveTracking = buses.some(bus => bus.lastLocation && bus.trackingStatus === 'LIVE' && !bus.isSimulated);

  // Selected bus and route for progression styling
  const selectedBus = buses.find((b) => b.id === selectedBusId);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Standard OpenStreetMap tiles (free, public geographic streets & labels, NO API key required)
    const tileUrl =
      (import.meta as any).env?.VITE_MAP_TILE_URL ||
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution =
      (import.meta as any).env?.VITE_MAP_ATTRIBUTION ||
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: true,
      maxZoom: 19,
      minZoom: 4,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution,
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    tileLayer.on('tileload', () => {
      setTileError(false);
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
    mapInstanceRef.current = map;

    // Detect user manual navigation to avoid snapping them away
    map.on('dragstart', () => {
      dispatchFollow('pan');
    });

    // Invalidate size to guarantee responsive rendering in tabs / modals
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const handleWindowResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleWindowResize);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Route Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.values(routeLayersRef.current).forEach((p) => map.removeLayer(p));
    routeLayersRef.current = {};

    routes.forEach((route) => {
      if (!Array.isArray(route.pathCoordinates) || route.pathCoordinates.length < 2) return;

      const isSelected = selectedRouteId === route.id;
      const opacity = selectedRouteId ? (isSelected ? 0.95 : 0.25) : 0.75;
      const weight = isSelected ? 5.5 : 3.5;

      // Filter valid coordinates for polyline
      const validPoints = route.pathCoordinates.filter(
        (pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
      );
      if (validPoints.length < 2) return;

      const polyline = L.polyline(validPoints, {
        color: route.color || '#2563EB',
        weight,
        opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      polyline.bindTooltip(
        `<div class="font-bold text-xs">${route.code} — ${route.name}</div>`,
        { sticky: true }
      );
      routeLayersRef.current[route.id] = polyline;
    });
  }, [routes, selectedRouteId]);

  // Update Stop Waypoint Markers with progression indicators
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.values(stopMarkersRef.current).forEach((m) => map.removeLayer(m));
    stopMarkersRef.current = {};

    const stopsMap = new Map<string, Stop>();
    routes.forEach((r) => {
      if (Array.isArray(r.stops)) {
        r.stops.forEach((s) => {
          if (!stopsMap.has(s.id)) stopsMap.set(s.id, s);
        });
      }
    });

    const completedIds = new Set(selectedBus?.completedStopIds || []);
    const nextStopId = selectedBus?.nextStopId;

    stopsMap.forEach((stop) => {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;

      const isCompleted = completedIds.has(stop.id);
      const isNext = nextStopId === stop.id;

      let iconHtml = '';
      let iconSize: [number, number] = [16, 16];
      let iconAnchor: [number, number] = [8, 8];

      if (isNext) {
        // Next eligible stop: highlighted with pulsing badge
        iconHtml = `
          <div class="relative flex flex-col items-center justify-center cursor-pointer">
            <span class="px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-black text-[9px] shadow-md mb-0.5 whitespace-nowrap animate-pulse">NEXT STOP</span>
            <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md ring-4 ring-blue-400/40 animate-ping"></div>
          </div>
        `;
        iconSize = [56, 36];
        iconAnchor = [28, 30];
      } else if (isCompleted) {
        // Already arrived / completed stop
        iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="w-4 h-4 rounded-full bg-emerald-600 border-2 border-white shadow-md flex items-center justify-center text-white">
              <svg class="w-2.5 h-2.5 stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        `;
        iconSize = [16, 16];
        iconAnchor = [8, 8];
      } else {
        // Standard upcoming stop waypoint
        iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-700 shadow-md"></div>
          </div>
        `;
        iconSize = [14, 14];
        iconAnchor = [7, 7];
      }

      const stopIcon = L.divIcon({
        className: 'custom-stop-marker',
        html: iconHtml,
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon, title: stop.name, alt: stop.name, keyboard: Boolean(onSelectStop) }).addTo(map);
      const label = document.createElement('div');
      label.className = 'text-xs font-semibold text-slate-900';
      label.textContent = stop.name + (isNext ? ' (Next stop)' : isCompleted ? ' (Arrived)' : '');
      marker.getElement()?.setAttribute('aria-label', stop.name);
      marker.getElement()?.setAttribute('role', onSelectStop ? 'button' : 'img');
      marker.bindTooltip(label, { direction: 'top', offset: [0, -8] });

      marker.on('click', () => {
        if (onSelectStop) onSelectStop(stop);
      });

      stopMarkersRef.current[stop.id] = marker;
    });
  }, [routes, selectedBus?.completedStopIds, selectedBus?.nextStopId, onSelectStop]);

  // Update Live Bus Markers strictly from genuine GPS telemetry
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    onSelectBusRef.current = onSelectBus;
    busesByIdRef.current = new Map(buses.map((b) => [b.id, b]));
    const currentBusIds = new Set(buses.map((b) => b.id));

    const dropBus = (id: string) => {
      if (busMarkersRef.current[id]) {
        map.removeLayer(busMarkersRef.current[id]);
        delete busMarkersRef.current[id];
      }
      if (busAccuracyRef.current[id]) {
        map.removeLayer(busAccuracyRef.current[id]);
        delete busAccuracyRef.current[id];
      }
    };
    Object.keys(busMarkersRef.current).forEach((id) => { if (!currentBusIds.has(id)) dropBus(id); });
    Object.keys(busAccuracyRef.current).forEach((id) => { if (!currentBusIds.has(id)) dropBus(id); });

    buses.forEach((bus) => {
      // Offline and maintenance vehicles are not drawn on the live map.
      if (bus.status === 'OFFLINE' || bus.status === 'MAINTENANCE') {
        dropBus(bus.id);
        return;
      }

      const lat = bus.lastLocation?.lat;
      const lng = bus.lastLocation?.lng;
      // Never show a bus at a fabricated coordinate: missing, non-finite or out-of-range positions get no marker.
      if (
        typeof lat !== 'number' || typeof lng !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180
      ) {
        dropBus(bus.id);
        return;
      }

      const isSelected = selectedBusId === bus.id;
      const route = routes.find((r) => r.id === bus.currentRouteId);
      const routeColor = route ? route.color : '#2563EB';
      const offline = bus.trackingStatus === 'DRIVER_OFFLINE';
      const hasHeading = typeof bus.heading === 'number' && Number.isFinite(bus.heading);
      const dotClass = bus.trackingStatus === 'LIVE' ? 'bg-emerald-500' : bus.trackingStatus === 'STALE' ? 'bg-amber-500' : 'bg-slate-400';
      const statusWord = bus.isSimulated ? 'Simulated'
        : bus.trackingStatus === 'LIVE' ? 'Live'
        : bus.trackingStatus === 'STALE' ? 'Stale'
        : bus.trackingStatus === 'DRIVER_OFFLINE' ? 'Offline'
        : 'Last reported';
      const updatedText = bus.lastLocation?.timestamp ? ` · updated ${new Date(bus.lastLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '';
      const speed = bus.speedKmh != null ? ` · ${bus.speedKmh} km/h` : '';
      const tooltipText = `${bus.busNumber} · ${statusWord}${speed}${updatedText}`;

      let marker = busMarkersRef.current[bus.id];
      if (!marker) {
        const iconContent = document.createElement('div');
        iconContent.innerHTML = `
          <div class="bus-marker flex flex-col items-center cursor-pointer">
            <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md mb-0.5" data-route-pill>
              <span class="w-1.5 h-1.5 rounded-full" data-status-dot></span>
              <span data-bus-number></span>
            </div>
            <div class="relative w-8 h-8">
              <div class="absolute inset-0" data-heading style="display: none;">
                <svg class="absolute left-1/2 -top-1.5 -translate-x-1/2 w-3 h-3 text-slate-900 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points="12,0 22,20 12,15 2,20" />
                </svg>
              </div>
              <svg class="absolute inset-0 w-8 h-8" viewBox="0 0 32 32" aria-hidden="true">
                <rect x="5" y="4" width="22" height="24" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
                <rect x="8" y="7" width="16" height="7" rx="1.5" fill="#0f172a" fill-opacity="0.85" />
                <circle cx="10.5" cy="24" r="2" fill="#0f172a" />
                <circle cx="21.5" cy="24" r="2" fill="#0f172a" />
              </svg>
            </div>
          </div>`;
        const icon = L.divIcon({
          className: 'bus-marker-wrapper',
          html: iconContent,
          iconSize: [56, 56],
          iconAnchor: [28, 38],
        });
        marker = L.marker([lat, lng], { icon, title: bus.busNumber, alt: bus.busNumber, zIndexOffset: 200, keyboard: Boolean(onSelectBus) }).addTo(map);
        marker.on('click', () => {
          const current = busesByIdRef.current.get(bus.id);
          if (current) onSelectBusRef.current?.(current);
        });
        marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -20] });
        busMarkersRef.current[bus.id] = marker;
      } else {
        // Only the position moves: the icon element is kept, so its CSS transform transition can animate between fixes.
        marker.setLatLng([lat, lng]);
        marker.setTooltipContent(tooltipText);
      }

      // Update in place: no icon rebuild, so transitions are not interrupted.
      const el = marker.getElement();
      if (el) {
        const busRoot = el.querySelector<HTMLElement>('.bus-marker');
        busRoot?.classList.toggle('is-selected', isSelected);
        busRoot?.classList.toggle('is-offline', offline);
        const pill = el.querySelector<HTMLElement>('[data-route-pill]');
        if (pill) pill.style.backgroundColor = routeColor;
        const dot = el.querySelector<HTMLElement>('[data-status-dot]');
        if (dot) dot.className = `w-1.5 h-1.5 rounded-full ${dotClass}`;
        const number = el.querySelector<HTMLElement>('[data-bus-number]');
        if (number && number.textContent !== bus.busNumber) number.textContent = bus.busNumber;
        const heading = el.querySelector<HTMLElement>('[data-heading]');
        if (heading) {
          heading.style.display = hasHeading ? '' : 'none';
          heading.style.transform = hasHeading ? `rotate(${bus.heading}deg)` : '';
        }
        el.setAttribute('aria-label', `${bus.busNumber}, ${statusWord}`);
        el.setAttribute('role', onSelectBus ? 'button' : 'img');
      }

      // Accuracy circle: the GPS error radius the device reported, drawn only when that value is genuine.
      const accuracy = bus.lastLocation?.accuracy;
      if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0 && !offline) {
        if (busAccuracyRef.current[bus.id]) {
          busAccuracyRef.current[bus.id].setLatLng([lat, lng]).setRadius(accuracy);
        } else {
          busAccuracyRef.current[bus.id] = L.circle([lat, lng], {
            radius: accuracy, color: routeColor, weight: 1, fillColor: routeColor, fillOpacity: 0.12, interactive: false,
          }).addTo(map);
        }
      } else if (busAccuracyRef.current[bus.id]) {
        map.removeLayer(busAccuracyRef.current[bus.id]);
        delete busAccuracyRef.current[bus.id];
      }
    });
  }, [buses, routes, selectedBusId, onSelectBus]);

  // Update Driver's Own Device Location Marker (when device geolocation is active)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (
      driverLocation &&
      Number.isFinite(driverLocation.lat) &&
      Number.isFinite(driverLocation.lng)
    ) {
      const { lat, lng, heading, accuracy } = driverLocation;
      const hasDriverHeading = typeof heading === 'number' && Number.isFinite(heading);

      const driverIconHtml = `
        <div class="relative flex items-center justify-center">
          <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg ring-4 ring-blue-500/40"></div>
          <div style="${hasDriverHeading ? `transform: rotate(${heading}deg);` : 'display: none;'}" class="absolute -top-1 w-2 h-2 text-blue-600">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,22 12,17 2,22"/></svg>
          </div>
        </div>
      `;

      const driverIcon = L.divIcon({
        className: 'driver-device-marker',
        html: driverIconHtml,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([lat, lng]).setIcon(driverIcon);
      } else {
        driverMarkerRef.current = L.marker([lat, lng], {
          icon: driverIcon,
          zIndexOffset: 300,
        }).addTo(map);
        driverMarkerRef.current.bindTooltip(
          '<div class="text-xs font-bold text-blue-700">Driver Phone GPS (Live)</div>',
          { direction: 'top', offset: [0, -10] }
        );
      }

      // Accuracy bubble
      if (accuracy && accuracy > 0) {
        if (driverAccuracyCircleRef.current) {
          driverAccuracyCircleRef.current.setLatLng([lat, lng]).setRadius(accuracy);
        } else {
          driverAccuracyCircleRef.current = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3B82F6',
            fillColor: '#93C5FD',
            fillOpacity: 0.15,
            weight: 1,
          }).addTo(map);
        }
      }
    } else {
      if (driverMarkerRef.current) {
        map.removeLayer(driverMarkerRef.current);
        driverMarkerRef.current = null;
      }
      if (driverAccuracyCircleRef.current) {
        map.removeLayer(driverAccuracyCircleRef.current);
        driverAccuracyCircleRef.current = null;
      }
    }
  }, [driverLocation]);

  // Recenter or fit map bounds when selected target changes (without overriding manual panning)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentTarget = selectedBusId || selectedRouteId;
    const hasTargetChanged = currentTarget !== lastSelectedTargetRef.current;

    if (hasTargetChanged) lastSelectedTargetRef.current = currentTarget;
    if (!hasTargetChanged && (!followBus || !selectedBusId)) return;

    if (selectedBusId) {
      const bus = buses.find((b) => b.id === selectedBusId);
      if (
        bus &&
        typeof bus.lastLocation?.lat === 'number' &&
        typeof bus.lastLocation?.lng === 'number' &&
        Number.isFinite(bus.lastLocation.lat) &&
        Number.isFinite(bus.lastLocation.lng)
      ) {
        if (hasTargetChanged) map.flyTo([bus.lastLocation.lat, bus.lastLocation.lng], 16, { duration: 0.8 });
        else map.panTo([bus.lastLocation.lat, bus.lastLocation.lng], { animate: true, duration: 0.8 });
      }
    } else if (selectedRouteId) {
      const route = routes.find((r) => r.id === selectedRouteId);
      if (route && Array.isArray(route.pathCoordinates) && route.pathCoordinates.length > 0) {
        const validCoords = route.pathCoordinates.filter(
          (pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
        );
        if (validCoords.length > 0) {
          map.fitBounds(L.latLngBounds(validCoords), { padding: [40, 40] });
        }
      }
    }
  }, [selectedBusId, selectedRouteId, buses, routes, followBus]);

  const recenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const isValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const selected = selectedBusId ? buses.find((b) => b.id === selectedBusId) : undefined;
    const lat = selected?.lastLocation?.lat;
    const lng = selected?.lastLocation?.lng;
    if (isValid(lat) && isValid(lng)) {
      dispatchFollow('recenter');
      map.flyTo([lat, lng], 16, { duration: 0.8 });
      return;
    }
    const route = selectedRouteId && routes.find(item => item.id === selectedRouteId);
    const routePoints = route ? route.pathCoordinates.filter(([lat, lng]) => isValid(lat) && isValid(lng)) : [];
    const points = routePoints.length ? routePoints : buses
      .filter((b) => isValid(b.lastLocation?.lat) && isValid(b.lastLocation?.lng))
      .map((b) => L.latLng(b.lastLocation!.lat, b.lastLocation!.lng));
    if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    else map.setView(center, zoom);
  };

  return (
    <div
      className={`relative w-full ${heightClass} ${className} rounded-2xl overflow-hidden border border-slate-200 shadow-sm min-h-[160px]`}
    >
      <div ref={mapContainerRef} role="region" aria-label="Campus transit map" className="w-full h-full z-0" />

      {/* Network / Tile loading notice banner */}
      {tileError && (
        <div className="absolute top-3 right-3 z-10 max-w-[8.5rem] sm:max-w-none bg-amber-100 text-amber-950 text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 backdrop-blur-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Background map unavailable</span>
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={recenter}
          className="min-h-11 px-3 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Recenter
        </button>
        {selectedBusId && (
          <button
            type="button"
            aria-pressed={followBus}
            onClick={() => dispatchFollow('toggle')}
            className={`min-h-11 px-3 rounded-xl border shadow-sm text-xs font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${
              followBus ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            {followBus ? 'Following bus' : 'Follow bus'}
          </button>
        )}
      </div>

      <div className="absolute bottom-3 left-3 z-10 bg-white/95 rounded-xl border border-slate-200 shadow-xs px-2.5 py-2 text-[10px] text-slate-700 flex flex-col gap-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />Live</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />Stale: no update for 20 s</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />Offline: no update for 2 min</span>
      </div>

      {/* Campus Transit Network Info Overlay */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-1.5 text-[11px] text-slate-700 max-w-[210px]">
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
          <span>Campus Transit Fleet</span>
          {hasLiveTracking && <span role="img" className="w-2 h-2 rounded-full bg-emerald-500" aria-label="Live tracking available" />}
        </div>
        {routes.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border border-white shadow-xs shrink-0"
              style={{ backgroundColor: r.color || '#2563EB' }}
            />
            <span className="truncate font-medium">{r.code}</span>
          </div>
        ))}
        {routes.length === 0 && <span className="text-slate-400 italic">No routes defined</span>}
      </div>
    </div>
  );
};
