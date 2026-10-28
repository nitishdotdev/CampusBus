import { describe, expect, it } from 'vitest';
import { calculateRouteETAs, determineConfidence, ETAConfidence } from '../server/utils/eta';
import { normalizeBusForClient } from '../server/socket';
import { isValidCoordinate } from '../server/utils/progression';

describe('ETA calculation and confidence tests', () => {
  const sampleStops = [
    { id: 'stop_1', name: 'West Gate', lat: 34.0537, lng: -118.2570, sequence: 1 },
    { id: 'stop_2', name: 'Student Union', lat: 34.0560, lng: -118.2590, sequence: 2 },
    { id: 'stop_3', name: 'Library', lat: 34.0580, lng: -118.2610, sequence: 3 },
  ];

  it('determines confidence based on telemetry freshness', () => {
    const now = new Date();
    expect(determineConfidence(now.toISOString(), 'ACTIVE')).toBe('LIVE');

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    expect(determineConfidence(oneMinuteAgo, 'ACTIVE')).toBe('DEGRADED');

    const fourMinutesAgo = new Date(Date.now() - 240 * 1000).toISOString();
    expect(determineConfidence(fourMinutesAgo, 'ACTIVE')).toBe('STALE');

    const tenMinutesAgo = new Date(Date.now() - 600 * 1000).toISOString();
    expect(determineConfidence(tenMinutesAgo, 'ACTIVE')).toBe('OFFLINE');

    expect(determineConfidence(now.toISOString(), 'MAINTENANCE')).toBe('OFFLINE');
    expect(determineConfidence(now.toISOString(), 'IDLE')).toBe('SCHEDULED');
  });

  it('returns empty ETAs for offline confidence', () => {
    const etas = calculateRouteETAs(34.0530, -118.2560, 25, sampleStops, 'OFFLINE');
    expect(etas).toEqual([]);
  });

  it('returns empty ETAs when bus coordinates are missing or invalid', () => {
    expect(calculateRouteETAs(NaN, -118.2560, 25, sampleStops, 'LIVE')).toEqual([]);
    expect(calculateRouteETAs(34.0530, 200, 25, sampleStops, 'LIVE')).toEqual([]);
    expect(calculateRouteETAs(95, -118.2560, 25, sampleStops, 'LIVE')).toEqual([]);
  });

  it('excludes already completed stops and starts from next eligible stop', () => {
    const etas = calculateRouteETAs(
      34.0530,
      -118.2560,
      25,
      sampleStops,
      'LIVE',
      {
        completedStopIds: ['stop_1'],
        nextStopId: 'stop_2',
      }
    );

    expect(etas.length).toBe(2);
    expect(etas[0].stopId).toBe('stop_2');
    expect(etas[1].stopId).toBe('stop_3');
    expect(etas[0].etaMinutes).toBeGreaterThanOrEqual(1);
    expect(etas[1].etaMinutes).toBeGreaterThan(etas[0].etaMinutes);
  });

  it('handles stationary buses without division by zero or infinite ETA', () => {
    const etas = calculateRouteETAs(
      34.0530,
      -118.2560,
      0, // Stationary (speed = 0)
      sampleStops,
      'LIVE'
    );

    expect(etas.length).toBe(3);
    expect(Number.isFinite(etas[0].etaMinutes)).toBe(true);
    expect(etas[0].etaMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe('Map coordinates and client bus normalization', () => {
  it('validates WGS-84 coordinate bounds correctly', () => {
    expect(isValidCoordinate(34.0537, -118.2570)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);

    expect(isValidCoordinate(90.1, 0)).toBe(false);
    expect(isValidCoordinate(-90.1, 0)).toBe(false);
    expect(isValidCoordinate(0, 180.1)).toBe(false);
    expect(isValidCoordinate(0, -180.1)).toBe(false);
    expect(isValidCoordinate(NaN, -118.2570)).toBe(false);
    expect(isValidCoordinate(34.0537, Infinity)).toBe(false);
    expect(isValidCoordinate(null, -118.2570)).toBe(false);
  });

  it('does not fabricate coordinates when bus has no location', () => {
    const normalized = normalizeBusForClient({
      id: 'bus_unlocated',
      college_id: 'col_apex',
      bus_number: 'BUS-GHOST',
      status: 'IDLE',
      last_location_lat: null,
      last_location_lng: null,
    });

    expect(normalized.lastLocation).toBeUndefined();
  });

  it('correctly maps etaToNextStopSeconds from upcomingEtas or nextStop', () => {
    const normalized = normalizeBusForClient({
      id: 'bus_with_eta',
      college_id: 'col_apex',
      bus_number: 'BUS-ETA',
      status: 'ACTIVE',
      last_location_lat: 34.0537,
      last_location_lng: -118.2570,
      nextStop: {
        stopName: 'Library',
        etaMinutes: 4,
        distanceKm: 1.2,
      },
    });

    expect(normalized.etaToNextStopSeconds).toBe(240);
  });
});
