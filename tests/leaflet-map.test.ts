import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const mapView = readFileSync(new URL('../src/components/map/MapView.tsx', import.meta.url), 'utf8');
const locationService = readFileSync(new URL('../src/services/locationService.ts', import.meta.url), 'utf8');
const studentDashboard = readFileSync(new URL('../src/pages/student/StudentDashboard.tsx', import.meta.url), 'utf8');
const telemetry = readFileSync(new URL('../src/services/v1/telemetry.ts', import.meta.url), 'utf8');
const driverDashboard = readFileSync(new URL('../src/pages/driver/DriverDashboard.tsx', import.meta.url), 'utf8');
const adminDirectory = readFileSync(new URL('../src/pages/admin/AdminDirectory.tsx', import.meta.url), 'utf8');
const adminAssignments = readFileSync(new URL('../src/pages/admin/AdminAssignments.tsx', import.meta.url), 'utf8');

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

  it('v1 telemetry envelope is tripId + events with lat/lng (not nested location/busId)', () => {
    expect(telemetry).toMatch(/tripId:\s*string/);
    expect(telemetry).toMatch(/lat:\s*number/);
    expect(telemetry).toMatch(/lng:\s*number/);
    expect(telemetry).not.toMatch(/location:\s*\{\s*lat/);
    expect(locationService).toMatch(/tripId:\s*this\.currentTripId/);
    expect(locationService).toMatch(/lat:\s*loc\.lat/);
    expect(locationService).toMatch(/lng:\s*loc\.lng/);
  });

  it('driver dashboard starts GPS only after tripsV1.start succeeds and stops on end', () => {
    expect(driverDashboard).toMatch(/tripsV1\.start/);
    expect(driverDashboard).toMatch(/locationService\.startTracking/);
    expect(driverDashboard).toMatch(/locationService\.stopTracking/);
    expect(driverDashboard).not.toMatch(/lastLocation:\s*\{\s*lat:\s*34\.0537/);
  });

  it('admin directory and assignments use v1 endpoints when VITE_USE_V1_API is on', () => {
    expect(adminDirectory).toMatch(/adminV1/);
    expect(adminDirectory).toMatch(/createDriver/);
    expect(adminAssignments).toMatch(/busesV1\.assignDriver/);
    expect(adminAssignments).toMatch(/adminV1/);
  });
});
