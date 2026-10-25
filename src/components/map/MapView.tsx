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
  center = [34.0537, -118.257],
  zoom = 15,
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
  const userHasPannedRef = useRef<boolean>(false);
  const lastSelectedTargetRef = useRef<string | undefined>(undefined);

  const [tileError, setTileError] = useState(false);

  const activeBusCount = buses.filter((b) => b.status === 'ACTIVE').length;

  // Selected bus and route for progression styling
  const selectedBus = buses.find((b) => b.id === selectedBusId);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Standard OpenStreetMap tiles (free, public geographic streets & labels, NO API key required)
    const tileUrl =
      (import.meta as any).env?.VITE_MAP_TILE_URL ||
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
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

    tileLayer.on('load', () => {
      setTileError(false);
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
    mapInstanceRef.current = map;

    // Detect user manual navigation to avoid snapping them away
    map.on('dragstart', () => {
      userHasPannedRef.current = true;
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

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map);
      marker.bindTooltip(
        `<div class="text-xs font-semibold text-slate-900">${stop.name}${isNext ? ' (Next Stop)' : isCompleted ? ' (Arrived)' : ''}</div>`,
        { direction: 'top', offset: [0, -8] }
      );

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

    const currentBusIds = new Set(buses.map((b) => b.id));

    // Remove obsolete markers
    Object.keys(busMarkersRef.current).forEach((id) => {
      if (!currentBusIds.has(id)) {
        map.removeLayer(busMarkersRef.current[id]);
        delete busMarkersRef.current[id];
      }
    });

    buses.forEach((bus) => {
      // Do not display offline or maintenance vehicles on active map
      if (bus.status === 'OFFLINE' || bus.status === 'MAINTENANCE') {
        if (busMarkersRef.current[bus.id]) {
          map.removeLayer(busMarkersRef.current[bus.id]);
          delete busMarkersRef.current[bus.id];
        }
        return;
      }

      const lat = bus.lastLocation?.lat;
      const lng = bus.lastLocation?.lng;

      // Guard against null, missing, NaN, or out-of-range coordinates.
      // NEVER show a bus at a fabricated coordinate simply to populate the map.
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        if (busMarkersRef.current[bus.id]) {
          map.removeLayer(busMarkersRef.current[bus.id]);
          delete busMarkersRef.current[bus.id];
        }
        return;
      }

      const isSelected = selectedBusId === bus.id;
      const heading = Number.isFinite(bus.heading) ? (bus.heading as number) : 0;
      const route = routes.find((r) => r.id === bus.currentRouteId);
      const routeColor = route ? route.color : '#2563EB';
      const statusColor = bus.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500';

      const busIconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer transition-transform">
          <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md mb-0.5 ${
            isSelected ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : ''
          }" style="background-color: ${routeColor};">
            <span class="w-1.5 h-1.5 rounded-full ${statusColor}"></span>
            <span>${bus.busNumber}</span>
          </div>
          <div class="w-7 h-7 rounded-full bg-white shadow-lg border-2 border-slate-800 flex items-center justify-center ${
            isSelected ? 'scale-115 ring-2 ring-blue-400' : ''
          }">
            <div style="transform: rotate(${heading}deg);" class="transition-transform duration-300">
              <svg class="w-4 h-4 text-blue-600 fill-current" viewBox="0 0 24 24">
                <polygon points="12,2 22,22 12,17 2,22" />
              </svg>
            </div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'bus-marker-wrapper',
        html: busIconHtml,
        iconSize: [52, 50],
        iconAnchor: [26, 42],
      });

      if (busMarkersRef.current[bus.id]) {
        busMarkersRef.current[bus.id].setLatLng([lat, lng]).setIcon(customIcon);
      } else {
        const marker = L.marker([lat, lng], { icon: customIcon, zIndexOffset: 200 }).addTo(map);
        marker.on('click', () => {
          if (onSelectBus) onSelectBus(bus);
        });
        busMarkersRef.current[bus.id] = marker;
      }

      // Detailed tooltip
      const nextStopText = bus.nextStop?.stopName || 'In Transit';
      const etaText = bus.nextStop?.etaMinutes ? `${bus.nextStop.etaMinutes} min` : 'Calculating';
      busMarkersRef.current[bus.id].bindTooltip(
        `<div class="p-1 text-xs">
          <div class="font-bold text-slate-900">${bus.busNumber} (${bus.status})</div>
          <div class="text-[11px] text-slate-600">Next: <strong>${nextStopText}</strong> (${etaText})</div>
          <div class="text-[10px] text-slate-400">Speed: ${bus.speedKmh || 0} km/h</div>
        </div>`,
        { direction: 'top', offset: [0, -20] }
      );
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
      const { lat, lng, heading = 0, accuracy } = driverLocation;

      const driverIconHtml = `
        <div class="relative flex items-center justify-center">
          <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg ring-4 ring-blue-500/40"></div>
          <div style="transform: rotate(${heading}deg);" class="absolute -top-1 w-2 h-2 text-blue-600">
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

    if (hasTargetChanged) {
      lastSelectedTargetRef.current = currentTarget;
      userHasPannedRef.current = false; // Reset pan suppression on explicit user selection
    }

    if (userHasPannedRef.current) {
      // User is actively exploring the map: do not auto-snap away
      return;
    }

    if (selectedBusId) {
      const bus = buses.find((b) => b.id === selectedBusId);
      if (
        bus &&
        typeof bus.lastLocation?.lat === 'number' &&
        typeof bus.lastLocation?.lng === 'number' &&
        Number.isFinite(bus.lastLocation.lat) &&
        Number.isFinite(bus.lastLocation.lng)
      ) {
        map.flyTo([bus.lastLocation.lat, bus.lastLocation.lng], 16, { duration: 0.8 });
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
  }, [selectedBusId, selectedRouteId, buses, routes]);

  return (
    <div
      className={`relative w-full ${heightClass} ${className} rounded-2xl overflow-hidden border border-slate-200 shadow-sm min-h-[240px]`}
    >
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Network / Tile loading notice banner */}
      {tileError && (
        <div className="absolute top-3 right-3 z-10 bg-amber-500/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 backdrop-blur-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Offline map cache active</span>
        </div>
      )}

      {/* Campus Transit Network Info Overlay */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-1.5 text-[11px] text-slate-700 max-w-[210px]">
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
          <span>Campus Transit Fleet</span>
          {activeBusCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
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
