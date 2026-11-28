import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, ev, freshTrip, PG_TEST_URL, type Harness } from './harness';

describe.skipIf(!PG_TEST_URL)('Trip occupancy and ordered GPS progression', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => { await h?.close(); });

  it('persists occupancy, advances only the next stop and ends the trip', async () => {
    const { campusA, campusB, route1, driver1, bus1 } = h.seed;
    const first = 'aaa000000000000000000001';
    const second = 'aaa000000000000000000002';
    await h.pool.query(
      "INSERT INTO v1.stops (id, route_id, name, lat, lng, stop_order) VALUES ($1,$3,'Library',28.4595,77.0266,0),($2,$3,'Gate',28.4605,77.0266,1)",
      [first, second, route1],
    );
    const trip = await freshTrip(h);
    expect(trip.nextStopId).toBe(first);
    const driver = h.token({ id: driver1, campusId: campusA, role: 'DRIVER' });
    const token = `Bearer ${driver}`;
    const client = request(h.app);
    const path = `/api/v1/trips/${trip.id}/occupancy`;
    const occupancy = (delta: number) => client.patch(path).set('Authorization', token).send({ delta });
    const foreign = h.token({ id: h.seed.driverB, campusId: campusB, role: 'DRIVER' });
    expect((await client.patch(path).set('Authorization', `Bearer ${foreign}`).send({ delta: 1 })).status).toBe(404);
    expect((await occupancy(41)).body.trip.currentOccupancy).toBe(40);
    expect((await occupancy(-39)).body.trip.currentOccupancy).toBe(1);
    const fix = async (event: object) => {
      const sent = await client.post('/api/v1/telemetry').set('Authorization', token).send({ tripId: trip.id, events: [event] });
      expect(sent.status).toBe(200);
      expect(sent.body.results[0].status).toBe('accepted');
    };
    await fix(ev(h, -15_000, 28.4605, 77.0266, { accuracyM: 8, speedMps: 0 }));
    expect((await h.services.repos.trips.findById(campusA, trip.id))?.completedStopIds).toEqual([]);
    // The bus waits at the first stop: two stationary fixes, 2 s apart, record the arrival.
    await fix(ev(h, -12_000, 28.4595, 77.0266, { accuracyM: 8, speedMps: 0 }));
    await fix(ev(h, -10_000, 28.4595, 77.0266, { accuracyM: 8, speedMps: 0 }));
    expect((await h.services.repos.buses.findById(campusA, bus1))?.activeTrip).toMatchObject({ nextStopId: second, completedStopIds: [first] });
    // It drives to the second stop at speed: passing the stop does not count as arrival.
    await fix(ev(h, -6_000, 28.4605, 77.0266, { accuracyM: 8, speedMps: 14 }));
    expect((await h.services.repos.trips.findById(campusA, trip.id))?.completedStopIds).toEqual([first]);
    // Then it stops there, and the second arrival completes the route.
    await fix(ev(h, -3_000, 28.4605, 77.0266, { accuracyM: 8, speedMps: 0 }));
    await fix(ev(h, -1_000, 28.4605, 77.0266, { accuracyM: 8, speedMps: 0 }));
    const ended = await client.post(`/api/v1/trips/${trip.id}/end`).set('Authorization', token).send({});
    expect(ended.body.trip).toMatchObject({ status: 'COMPLETED', nextStopId: null, currentOccupancy: 1, completedStopIds: [first, second], totalLocationsLogged: 6 });
    const detail = `/api/v1/trips/${trip.id}`;
    expect((await client.get(detail).set('Authorization', token)).body.trip.status).toBe('COMPLETED');
    expect((await client.get(detail).set('Authorization', `Bearer ${foreign}`)).status).toBe(404);
    const otherDriver = h.token({ id: h.seed.driver2, campusId: campusA, role: 'DRIVER' });
    expect((await client.get(detail).set('Authorization', `Bearer ${otherDriver}`)).status).toBe(404);
    expect((await occupancy(1)).status).toBe(404);
    expect((await h.services.repos.buses.findById(campusA, bus1))?.activeTrip).toBeNull();
  });
});
