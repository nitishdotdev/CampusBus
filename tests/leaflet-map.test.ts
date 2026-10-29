import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const mapView = readFileSync(new URL('../src/components/map/MapView.tsx', import.meta.url), 'utf8');
const locationService = readFileSync(new URL('../src/services/locationService.ts', import.meta.url), 'utf8');
const studentDashboard = readFileSync(new URL('../src/pages/student/StudentDashboard.tsx', import.meta.url), 'utf8');
const telemetry = readFileSync(new URL('../src/services/v1/telemetry.ts', import.meta.url), 'utf8');

describe('Leaflet OSM map and live GPS path', () => {
  it('MapView uses Leaflet with public OSM tiles and no map API key', () => {
    expect(mapView).toMatch(/from 'leaflet'/);
    expect(mapView).toMatch(/tile\.openstreetmap\.org/);
    expect(mapView).not.toMatch(/MAPBOX|GOOGLE_MAPS|maptiler|apiKey|AIza/i);
    expect(mapView).toMatch(/L\.map\(/);
    expect(mapView).toMatch(/L\.tileLayer\(/);
  });

  it('driver GPS posts telemetryV1 when VITE_USE_V1_API is on and a trip is active', () => {
    expect(locationService).toMatch(/telemetryV1/);
    expect(locationService).toMatch(/USE_V1 && this\.currentTripId/);
    expect(telemetry).toMatch(/\/api\/v1\/telemetry/);
  });

  it('student live map overlays socketV1 bus positions', () => {
    expect(studentDashboard).toMatch(/socketV1/);
    expect(studentDashboard).toMatch(/MapView/);
  });
});
