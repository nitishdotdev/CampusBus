import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const mapView = readFileSync(new URL('../src/components/map/MapView.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const useLiveBusesSource = readFileSync(new URL('../src/hooks/useLiveBuses.ts', import.meta.url), 'utf8');

describe('bus markers', () => {
  it('never rotates a marker toward north when GPS heading is missing', () => {
    expect(mapView).not.toMatch(/bus\.heading\) \? \(bus\.heading as number\) : 0/);
    expect(mapView).not.toMatch(/heading = 0/);
    expect(mapView).toMatch(/hasHeading \? `rotate\(\$\{bus\.heading\}deg\)` : ''/);
    expect(mapView).toMatch(/hasDriverHeading/);
  });

  it('updates an existing marker in place, so the position transition is not interrupted', () => {
    const effect = mapView.slice(mapView.indexOf('onSelectBusRef.current = onSelectBus;'), mapView.indexOf('Accuracy circle: the GPS error radius'));
    expect(effect).toMatch(/marker\.setLatLng\(\[lat, lng\]\)/);
    expect(effect).not.toMatch(/\.setIcon\(/);
    expect(css).toMatch(/\.bus-marker-wrapper \{\s*transition: transform 2\.5s linear;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });

  it('draws the accuracy circle only from a genuine reported accuracy value', () => {
    expect(mapView).toMatch(/const accuracy = bus\.lastLocation\?\.accuracy;/);
    expect(mapView).toMatch(/Number\.isFinite\(accuracy\) && accuracy > 0/);
  });

  it('gives students and admins recenter and follow controls that never snap back against a manual pan', () => {
    expect(mapView).toMatch(/Recenter/);
    expect(mapView).toMatch(/aria-pressed=\{followBus\}/);
    expect(mapView).toMatch(/dispatchFollow\('pan'\)/);
    expect(mapView).toMatch(/dispatchFollow\('recenter'\)/);
  });

  it('draws no marker for a bus without a valid position', () => {
    expect(mapView).toMatch(/Number\.isFinite\(lat\) \|\| !Number\.isFinite\(lng\)/);
  });
});

describe('live bus merge is wired into the student and admin maps', () => {
  it('resolves positions from REST and socket through the shared resolver', () => {
    expect(useLiveBusesSource).toMatch(/resolveBusPosition\(bus, socketFixes\.get\(bus\.id\), clock\)/);
  });
});

describe('student and admin dashboards read positions through the same merge', () => {
  const read = (p: string) => readFileSync(new URL(`../src/pages/${p}`, import.meta.url), 'utf8');
  it('admin and student live views both use useLiveBuses, not raw REST coordinates', () => {
    for (const page of ['admin/AdminLiveFleet.tsx', 'student/StudentLiveBuses.tsx', 'student/StudentDashboard.tsx']) {
      expect(read(page)).toMatch(/useLiveBuses\(/);
    }
  });
});
