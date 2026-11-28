import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const mapView = readFileSync(new URL('../src/components/map/MapView.tsx', import.meta.url), 'utf8');
const locationService = readFileSync(new URL('../src/services/locationService.ts', import.meta.url), 'utf8');
const liveOverlay = readFileSync(new URL('../src/hooks/useLiveBuses.ts', import.meta.url), 'utf8');
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

  it('scopes queued GPS fixes to the authenticated driver and the original trip', () => {
    expect(locationService).toMatch(/runSyncPass\(\{\s*driverId,/);
    expect(locationService).toMatch(/transport: telemetryV1/);
    expect(locationService).toMatch(/isCurrent: \(\) => this.driverEpoch === epoch/);
    expect(telemetry).toMatch(/\/api\/v1\/telemetry/);
  });

  it('student live map overlays socketV1 bus positions', () => {
    expect(studentDashboard).toMatch(/useLiveBuses/);
    expect(liveOverlay).toMatch(/socketV1/);
    expect(studentDashboard).toMatch(/MapView/);
  });

  it('v1 telemetry envelope is tripId + events with lat/lng (not nested location/busId)', () => {
    expect(telemetry).toMatch(/tripId:\s*string/);
    expect(telemetry).toMatch(/lat:\s*number/);
    expect(telemetry).toMatch(/lng:\s*number/);
    expect(telemetry).not.toMatch(/location:\s*\{\s*lat/);
  });

  it('driver dashboard starts GPS only after tripsV1.start succeeds and stops on end', () => {
    expect(driverDashboard).toMatch(/tripsV1\.start/);
    expect(driverDashboard).toMatch(/locationService\.startTracking/);
    expect(driverDashboard).toMatch(/tripService\.clearActiveTrip/);
    expect(driverDashboard).not.toMatch(/lastLocation:\s*\{\s*lat:\s*34\.0537/);
  });

  it('admin directory and assignments use v1 endpoints', () => {
    expect(adminDirectory).toMatch(/adminV1/);
    expect(adminDirectory).toMatch(/createDriver/);
    expect(adminAssignments).toMatch(/busesV1\.assign\(/);
    expect(adminAssignments).toMatch(/adminV1/);
  });
});
