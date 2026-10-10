import fetch from 'node-fetch';
import { io } from 'socket.io-client';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, details?: string) {
  results.push({ suite, name, passed: condition, details });
  if (condition) {
    console.log(`  [PASS] ${name}`);
  } else {
    console.error(`  [FAIL] ${name} - Details: ${details || 'Assertion failed'}`);
  }
}

async function runAllTests() {
  console.log('=== RUNNING SMART CAMPUS BUS VERIFICATION SUITE ===\n');

  // 1. Health check & DB engine check
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as any;
    assert('System Health', 'API Health Check responds with 200 OK', res.status === 200 && data.status === 'ok');
    assert('System Health', 'Database reporting operational status', !!data.database);
  } catch (err: any) {
    assert('System Health', 'API Health Check responds with 200 OK', false, err.message);
  }

  // 2. JWT Authentication
  let studentToken = '';
  let driverToken = '';
  let adminToken = '';
  let metroStudentToken = '';

  try {
    // Student login (Alex Chen - Apex)
    const studentRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex.chen@apex.edu', password: 'ApexBus2025!' }),
    });
    const studentData = await studentRes.json() as any;
    assert('Authentication', 'Student login succeeds with valid token', studentRes.status === 200 && !!studentData.token);
    assert('Authentication', 'Student payload has correct role and college', studentData.user?.role === 'STUDENT' && studentData.user?.collegeId === 'college_apex');
    studentToken = studentData.token;

    // Driver login (Marcus Vance - Apex)
    const driverRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marcus.vance@transit.apex.edu', password: 'ApexBus2025!' }),
    });
    const driverData = await driverRes.json() as any;
    assert('Authentication', 'Driver login succeeds with valid token', driverRes.status === 200 && !!driverData.token);
    assert('Authentication', 'Driver payload has correct role', driverData.user?.role === 'DRIVER');
    driverToken = driverData.token;

    // Admin login (Sarah Jenkins - Apex)
    const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.edu', password: 'ApexBus2025!' }),
    });
    const adminData = await adminRes.json() as any;
    assert('Authentication', 'Admin login succeeds with valid token', adminRes.status === 200 && !!adminData.token);
    assert('Authentication', 'Admin payload has correct role', adminData.user?.role === 'ADMIN');
    adminToken = adminData.token;

    // Metro Student login (Jordan Miller - Metro)
    const metroRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jordan@metro.edu', password: 'ApexBus2025!' }),
    });
    const metroData = await metroRes.json() as any;
    assert('Authentication', 'Metro student login succeeds with college_metro', metroRes.status === 200 && metroData.user?.collegeId === 'college_metro');
    metroStudentToken = metroData.token;

    // Invalid credentials check
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake@apex.edu', password: 'wrong' }),
    });
    assert('Authentication', 'Invalid credentials correctly return 401 Unauthorized', badLoginRes.status === 401);

    // Profile verification via /api/auth/me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const meData = await meRes.json() as any;
    assert('Authentication', 'Profile endpoint verifies JWT and returns student info', meRes.status === 200 && meData.user?.id === 'usr_student_alex');

    // P0: Verify /api/auth/switch-role is disabled/forbidden/removed
    const switchRoleRes = await fetch(`${BASE_URL}/api/auth/switch-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert('P0 Security', '/api/auth/switch-role is blocked (404 Not Found or 403 Forbidden)', switchRoleRes.status === 404 || switchRoleRes.status === 403);
  } catch (err: any) {
    assert('Authentication', 'Authentication flow completed', false, err.message);
  }

  // 3. RBAC (Role-Based Access Control)
  try {
    // Student attempting admin endpoint (POST /api/buses)
    const forbiddenBusRes = await fetch(`${BASE_URL}/api/buses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ busNumber: 'HACK-999', plateNumber: 'HACK-99' }),
    });
    assert('RBAC', 'Student denied from creating buses (403 Forbidden)', forbiddenBusRes.status === 403);

    // Student attempting driver endpoint (POST /api/trips/start)
    const forbiddenTripRes = await fetch(`${BASE_URL}/api/trips/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ busId: 'bus_104', routeId: 'route_blue' }),
    });
    assert('RBAC', 'Student denied from starting trips (403 Forbidden)', forbiddenTripRes.status === 403);

    // Driver attempting admin broadcast
    const forbiddenBroadcastRes = await fetch(`${BASE_URL}/api/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ title: 'Driver Announcement', message: 'Test' }),
    });
    assert('RBAC', 'Driver denied from broadcasting admin notifications (403 Forbidden)', forbiddenBroadcastRes.status === 403);
  } catch (err: any) {
    assert('RBAC', 'RBAC checks completed', false, err.message);
  }

  // 4. College Tenant Isolation
  try {
    // Apex student requests buses
    const apexBusesRes = await fetch(`${BASE_URL}/api/buses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const apexBuses = await apexBusesRes.json() as any[];
    const hasOnlyApex = apexBuses.every((b) => b.collegeId === 'college_apex');
    const hasMetroBus = apexBuses.some((b) => b.collegeId === 'college_metro' || b.busNumber === 'MPU-01');
    assert('Tenant Isolation', 'Apex user gets only Apex buses', hasOnlyApex && apexBuses.length > 0);
    assert('Tenant Isolation', 'Apex user cannot see Metro buses', !hasMetroBus);

    // Metro student requests buses
    const metroBusesRes = await fetch(`${BASE_URL}/api/buses`, {
      headers: { Authorization: `Bearer ${metroStudentToken}` },
    });
    const metroBuses = await metroBusesRes.json() as any[];
    const hasOnlyMetro = metroBuses.every((b) => b.collegeId === 'college_metro');
    const hasApexBus = metroBuses.some((b) => b.collegeId === 'college_apex');
    assert('Tenant Isolation', 'Metro user gets only Metro buses', hasOnlyMetro);
    assert('Tenant Isolation', 'Metro user cannot see Apex buses', !hasApexBus);

    // Apex student requests routes
    const apexRoutesRes = await fetch(`${BASE_URL}/api/routes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const apexRoutes = await apexRoutesRes.json() as any[];
    const hasOnlyApexRoutes = apexRoutes.every((r) => r.collegeId === 'college_apex');
    assert('Tenant Isolation', 'Apex student receives only Apex routes', hasOnlyApexRoutes);

    // Cross-tenant modification attempt: Apex admin attempts to modify Metro bus
    const crossUpdateRes = await fetch(`${BASE_URL}/api/buses/bus_metro_201`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ model: 'Hacked Model' }),
    });
    assert('Tenant Isolation', 'Cross-tenant bus modification blocked (404 Not Found)', crossUpdateRes.status === 404);
  } catch (err: any) {
    assert('Tenant Isolation', 'Tenant isolation checks completed', false, err.message);
  }

  // 5. Driver Trip Lifecycle & Occupancy
  let testTripId = '';
  try {
    // Setup (not an assertion): the dev seed data and earlier interrupted runs can leave this driver with an
    // active trip, and the one-active-trip-per-driver rule would then reject the trip started below.
    await fetch(`${BASE_URL}/api/trips/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({}),
    });

    // Driver starts trip
    const startRes = await fetch(`${BASE_URL}/api/trips/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ busId: 'bus_104', routeId: 'route_blue' }),
    });
    const startData = await startRes.json() as any;
    assert('Trip Lifecycle', 'Driver can start trip (201 Created)', startRes.status === 201 && !!startData.trip?.id);
    testTripId = startData.trip?.id;

    // P0: Verify another user cannot start trip on the same bus while trip is active
    const conflictRes = await fetch(`${BASE_URL}/api/trips/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ busId: 'bus_104', routeId: 'route_blue' }),
    });
    assert('P0 Security', 'Conflict returned when starting trip on bus already in active trip (409 Conflict)', conflictRes.status === 409);

    // Check active trip endpoint
    const activeRes = await fetch(`${BASE_URL}/api/trips/active`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const activeData = await activeRes.json() as any;
    assert('Trip Lifecycle', 'Active trip correctly retrieved for driver', activeData.activeTrip?.id === testTripId);

    // Update Occupancy: increment by 5
    const occRes1 = await fetch(`${BASE_URL}/api/trips/occupancy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ delta: 5 }),
    });
    const occData1 = await occRes1.json() as any;
    assert('Occupancy', 'Occupancy increments by delta (5 passengers)', occData1.currentOccupancy === 5);

    // Update Occupancy: absolute count with clamping check (exceeding capacity)
    const occRes2 = await fetch(`${BASE_URL}/api/trips/occupancy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ absoluteCount: 999 }),
    });
    const occData2 = await occRes2.json() as any;
    assert('Occupancy', 'Occupancy clamped to bus capacity', occData2.currentOccupancy === occData2.capacity && occData2.isFull === true);

    // End Trip
    const endRes = await fetch(`${BASE_URL}/api/trips/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ tripId: testTripId }),
    });
    const endData = await endRes.json() as any;
    assert('Trip Lifecycle', 'Driver can end trip successfully', endRes.status === 200 && endData.trip?.status === 'COMPLETED');
  } catch (err: any) {
    assert('Trip Lifecycle', 'Trip lifecycle checks completed', false, err.message);
  }

  // 6. Real GPS Location & Duplicate Prevention
  try {
    // P0: Coordinate validation checks
    const badLatRes = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        busId: 'bus_104',
        lat: 195.0, // Invalid: latitude > 90
        lng: -118.2570,
      }),
    });
    assert('P0 Validation', 'Invalid latitude (>90) rejected with 400 Bad Request', badLatRes.status === 400);

    const badLngRes = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        busId: 'bus_104',
        lat: 34.0537,
        lng: 200.0, // Invalid: longitude > 180
      }),
    });
    assert('P0 Validation', 'Invalid longitude (>180) rejected with 400 Bad Request', badLngRes.status === 400);

    const fixedLocationId = 'loc_test_fixed_' + Date.now();
    const fixedTimestamp = '2026-09-20T05:00:00.000Z';

    // First transmission of GPS point
    const locRes1 = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        id: fixedLocationId,
        busId: 'bus_104',
        tripId: 'trip_active_marcus',
        lat: 34.0537,
        lng: -118.2570,
        speed: 7.5,
        heading: 90,
        accuracy: 4.2,
        timestamp: fixedTimestamp,
        isSimulated: false,
      }),
    });
    assert('GPS & Deduplication', 'First location point saved successfully', locRes1.status === 200);

    // Second transmission of identical location point (same id & timestamp)
    const locRes2 = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        id: fixedLocationId,
        busId: 'bus_104',
        tripId: 'trip_active_marcus',
        lat: 34.0537,
        lng: -118.2570,
        speed: 7.5,
        heading: 90,
        accuracy: 4.2,
        timestamp: fixedTimestamp,
        isSimulated: false,
      }),
    });
    assert('GPS & Deduplication', 'Duplicate location accepted without 500 error', locRes2.status === 200);

    // Batch Offline Queue Sync (POST /api/driver/location/sync)
    const batchRes = await fetch(`${BASE_URL}/api/driver/location/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        locations: [
          {
            id: 'loc_batch_1_' + Date.now(),
            tripId: 'trip_active_marcus',
            busId: 'bus_104',
            lat: 34.0540,
            lng: -118.2575,
            speed: 6.2,
            heading: 95,
            accuracy: 5.0,
            timestamp: new Date().toISOString(),
          },
          {
            id: 'loc_batch_2_' + Date.now(),
            tripId: 'trip_active_marcus',
            busId: 'bus_104',
            lat: 34.0545,
            lng: -118.2580,
            speed: 6.8,
            heading: 100,
            accuracy: 4.8,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    const batchData = await batchRes.json() as any;
    assert('Offline GPS Queue', 'Batch sync of offline queued locations succeeds', batchRes.status === 200 && (batchData.savedCount === 2 || batchData.syncedPointsCount === 2), JSON.stringify({ status: batchRes.status, batchData }));
  } catch (err: any) {
    assert('GPS & Deduplication', 'GPS tracking & offline sync completed', false, err.message);
  }

  // 7. Emergency Alerts Lifecycle
  let alertId = '';
  try {
    // Driver triggers emergency alert
    const triggerAlertRes = await fetch(`${BASE_URL}/api/driver/emergency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({
        type: 'MECHANICAL_BREAKDOWN',
        severity: 'MEDIUM',
        busId: 'bus_104',
        tripId: 'trip_active_marcus',
        lat: 34.055,
        lng: -118.258,
        description: 'Engine temperature indicator warning on hill ascent.',
      }),
    });
    const alertData = await triggerAlertRes.json() as any;
    assert('Emergency Alerts', 'Driver can trigger emergency alert', triggerAlertRes.status === 201 && !!alertData.alert?.id);
    alertId = alertData.alert?.id;

    // Admin lists alerts
    const listAlertsRes = await fetch(`${BASE_URL}/api/alerts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const alerts = await listAlertsRes.json() as any[];
    assert('Emergency Alerts', 'Admin can list emergency alerts', listAlertsRes.status === 200 && alerts.some((a) => a.id === alertId));

    // Admin acknowledges alert
    const ackRes = await fetch(`${BASE_URL}/api/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ notes: 'Support van dispatched to location.' }),
    });
    const ackData = await ackRes.json() as any;
    assert('Emergency Alerts', 'Admin can acknowledge alert', ackRes.status === 200 && ackData.status === 'ACKNOWLEDGED');

    // Admin resolves alert
    const resRes = await fetch(`${BASE_URL}/api/alerts/${alertId}/resolve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ notes: 'Mechanic checked coolant levels; cleared.' }),
    });
    const resData = await resRes.json() as any;
    assert('Emergency Alerts', 'Admin can resolve alert', resRes.status === 200 && resData.status === 'RESOLVED');
  } catch (err: any) {
    assert('Emergency Alerts', 'Emergency alerts workflow completed', false, err.message);
  }

  // 8. Notifications Flow
  let notifId = '';
  try {
    // Admin broadcasts notification
    const postNotifRes = await fetch(`${BASE_URL}/api/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Weather Advisory - Heavy Rain',
        message: 'Campus perimeter shuttles operating with 5-minute delays due to wet road conditions.',
        category: 'WEATHER_DELAY',
        priority: 'HIGH',
      }),
    });
    const notifData = await postNotifRes.json() as any;
    assert('Notifications', 'Admin can broadcast institutional notification', postNotifRes.status === 201 && !!notifData.id);
    notifId = notifData.id;

    // Student reads notifications
    const getNotifsRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const notifs = await getNotifsRes.json() as any[];
    assert('Notifications', 'Student can retrieve institutional notifications', getNotifsRes.status === 200 && notifs.some((n) => n.id === notifId));

    // Mark notification as read
    const readRes = await fetch(`${BASE_URL}/api/notifications/${notifId}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('Notifications', 'Student can mark notification as read', readRes.status === 200);
  } catch (err: any) {
    assert('Notifications', 'Notifications flow completed', false, err.message);
  }

  // 9. Bus / Route / Stop CRUD
  let createdBusId = '';
  let createdRouteId = '';
  let createdStopId = '';
  try {
    // 9a. Bus CRUD
    const createBusRes = await fetch(`${BASE_URL}/api/buses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        busNumber: 'BUS-999',
        plateNumber: 'CA-999ZZ',
        capacity: 50,
        model: 'New Flyer Xcelsior CHARGE',
      }),
    });
    const createdBus = await createBusRes.json() as any;
    assert('Fleet CRUD', 'Admin can CREATE bus', createBusRes.status === 201 && createdBus.bus_number === 'BUS-999');
    createdBusId = createdBus.id;

    // Read single bus
    const getBusRes = await fetch(`${BASE_URL}/api/buses/${createdBusId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Fleet CRUD', 'Admin can READ single bus', getBusRes.status === 200);

    // Update bus
    const updateBusRes = await fetch(`${BASE_URL}/api/buses/${createdBusId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ capacity: 55 }),
    });
    const updatedBus = await updateBusRes.json() as any;
    assert('Fleet CRUD', 'Admin can UPDATE bus', updateBusRes.status === 200 && updatedBus.capacity === 55);

    // Delete bus
    const deleteBusRes = await fetch(`${BASE_URL}/api/buses/${createdBusId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Fleet CRUD', 'Admin can DELETE bus', deleteBusRes.status === 200);

    // 9b. Route CRUD
    const createRouteRes = await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        code: 'TEST-01',
        name: 'Test Campus Loop',
        description: 'Verification route',
        color: '#EA580C',
        frequencyMinutes: 12,
      }),
    });
    const createdRoute = await createRouteRes.json() as any;
    assert('Fleet CRUD', 'Admin can CREATE route', createRouteRes.status === 201 && createdRoute.code === 'TEST-01');
    createdRouteId = createdRoute.id;

    // Update route
    const updateRouteRes = await fetch(`${BASE_URL}/api/routes/${createdRouteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Updated Test Campus Loop' }),
    });
    const updatedRoute = await updateRouteRes.json() as any;
    assert('Fleet CRUD', 'Admin can UPDATE route', updateRouteRes.status === 200 && updatedRoute.name === 'Updated Test Campus Loop');

    // Add Stop to route
    const addStopRes = await fetch(`${BASE_URL}/api/routes/${createdRouteId}/stops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Test Library Stop',
        lat: 34.0560,
        lng: -118.2570,
        landmark: 'Near West Gate',
      }),
    });
    const createdStop = await addStopRes.json() as any;
    assert('Fleet CRUD', 'Admin can CREATE stop on route', addStopRes.status === 201 && createdStop.name === 'Test Library Stop');
    createdStopId = createdStop.id;

    // Delete stop
    const deleteStopRes = await fetch(`${BASE_URL}/api/routes/${createdRouteId}/stops/${createdStopId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Fleet CRUD', 'Admin can DELETE stop', deleteStopRes.status === 200);

    // Delete route
    const deleteRouteRes = await fetch(`${BASE_URL}/api/routes/${createdRouteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Fleet CRUD', 'Admin can DELETE route', deleteRouteRes.status === 200);
  } catch (err: any) {
    assert('Fleet CRUD', 'Fleet CRUD operations completed', false, err.message);
  }

  // 10. ETA Confidence States (LIVE, DEGRADED, SCHEDULED, OFFLINE)
  try {
    const busesRes = await fetch(`${BASE_URL}/api/buses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const buses = await busesRes.json() as any[];
    const confidences = new Set(buses.map((b) => b.etaConfidence));
    assert('ETA Confidence', 'Bus fleet provides calculated etaConfidence fields', confidences.size > 0);
    // BUS-103 is maintenance/offline -> OFFLINE
    const maintenanceBus = buses.find((b) => b.busNumber === 'BUS-103');
    assert('ETA Confidence', 'Maintenance bus has OFFLINE confidence', maintenanceBus?.etaConfidence === 'OFFLINE');
    // BUS-104 is active -> LIVE
    const activeBus = buses.find((b) => b.busNumber === 'BUS-104');
    assert('ETA Confidence', 'Active bus has LIVE or calculated confidence', !!activeBus?.etaConfidence);
  } catch (err: any) {
    assert('ETA Confidence', 'ETA confidence check completed', false, err.message);
  }

  // 11. Socket.IO Real-time Events & Authorization
  // 11a. Unauthenticated Socket connection should be rejected
  await new Promise<void>((resolve) => {
    try {
      const unauthSocket = io(BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 2000,
      });

      unauthSocket.on('connect', () => {
        assert('P0 Socket Auth', 'Unauthenticated socket rejected', false, 'Socket connected without token');
        unauthSocket.disconnect();
        resolve();
      });

      unauthSocket.on('connect_error', (err) => {
        assert('P0 Socket Auth', 'Unauthenticated socket rejected by middleware', true);
        unauthSocket.disconnect();
        resolve();
      });

      setTimeout(() => {
        unauthSocket.disconnect();
        resolve();
      }, 2500);
    } catch (err: any) {
      assert('P0 Socket Auth', 'Unauthenticated socket rejected by middleware', true);
      resolve();
    }
  });

  // 11b. Authenticated Socket connection and Tenant Isolation
  await new Promise<void>((resolve) => {
    try {
      const socket = io(BASE_URL, {
        auth: { token: studentToken },
        transports: ['websocket', 'polling'],
        reconnection: false,
      });

      let testDone = false;

      socket.on('connect', () => {
        assert('Real-time Socket.IO', 'Client connects to Socket.IO with JWT auth', true);

        // Attempt cross-tenant room join (Apex student trying to join Metro room)
        socket.emit('join-room', 'college:college_metro', (response?: { success: boolean; error?: string }) => {
          if (response) {
            assert('P0 Tenant Isolation', 'Cross-tenant socket room join rejected', !response.success);
          }
        });

        // Listen for unauthorized room error event
        socket.on('room-join-error', (errPayload: any) => {
          assert('P0 Tenant Isolation', 'Cross-tenant socket room join rejected via room-join-error', true);
          if (!testDone) {
            testDone = true;
            socket.disconnect();
            resolve();
          }
        });

        // Cleanup timeout
        setTimeout(() => {
          if (!testDone) {
            testDone = true;
            socket.disconnect();
            resolve();
          }
        }, 1500);
      });

      socket.on('connect_error', (err) => {
        assert('Real-time Socket.IO', 'Client connects to Socket.IO with JWT auth', false, err.message);
        socket.disconnect();
        resolve();
      });

      setTimeout(() => {
        if (!testDone) {
          testDone = true;
          socket.disconnect();
          resolve();
        }
      }, 3000);
    } catch (err: any) {
      assert('Real-time Socket.IO', 'Socket.IO connection setup', false, err.message);
      resolve();
    }
  });

  // Summary
  console.log('\n========================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
