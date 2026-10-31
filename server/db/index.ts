import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export interface DBConfig {
  databaseUrl?: string;
  isPostgres: boolean;
}

let pool: pg.Pool | null = null;
const DATA_DIR = path.join(process.cwd(), '.data');
const DB_JSON_PATH = path.join(DATA_DIR, 'database.json');

// Interface types for database models
export interface CollegeRecord {
  id: string;
  name: string;
  short_code: string;
  domain: string;
  center_lat: number;
  center_lng: number;
  zoom_level: number;
  settings: Record<string, any>;
  created_at: string;
}

export interface UserRecord {
  id: string;
  college_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
  student_id?: string;
  cdl_number?: string;
  phone?: string;
  status: string;
  created_at: string;
}

export interface RouteRecord {
  id: string;
  college_id: string;
  code: string;
  name: string;
  description?: string;
  color: string;
  status: 'ACTIVE' | 'SCHEDULED' | 'DELAYED' | 'SUSPENDED';
  schedule_hours: string;
  frequency_minutes: number;
  path_coordinates: [number, number][];
  created_at: string;
}

export interface StopRecord {
  id: string;
  college_id: string;
  route_id?: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  landmark?: string;
  sequence: number;
  created_at: string;
}

export type BusStatus = 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'OFFLINE' | 'OFF_DUTY' | 'OUT_OF_SERVICE';

export interface BusRecord {
  id: string;
  college_id: string;
  bus_number: string;
  plate_number: string;
  capacity: number;
  model?: string;
  current_route_id?: string;
  current_driver_id?: string;
  driver_name?: string;
  status: BusStatus;
  last_location_lat: number;
  last_location_lng: number;
  heading: number;
  speed_kmh: number;
  current_occupancy: number;
  gps_status: string;
  network_status: string;
  eta_confidence: 'LIVE' | 'DEGRADED' | 'STALE' | 'OFFLINE' | 'SCHEDULED';
  is_simulated: boolean;
  last_sync_timestamp: string;
  current_stop_id?: string | null;
  next_stop_id?: string | null;
  completed_stop_ids?: string[];
  updated_at: string;
}

export interface ScheduleRecord {
  id: string;
  college_id: string;
  bus_id: string;
  route_id: string;
  departure_time: string;
  arrival_time?: string;
  operating_days: string[];
  status: "ACTIVE" | "INACTIVE" | "CANCELLED";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ComplaintRecord {
  id: string;
  college_id: string;
  student_id: string;
  trip_id?: string;
  bus_id?: string;
  route_id?: string;
  title: string;
  description: string;
  category:
    | "DRIVER_BEHAVIOR"
    | "VEHICLE_CONDITION"
    | "SCHEDULE_ISSUE"
    | "CLEANLINESS"
    | "SAFETY"
    | "OTHER";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH";
  admin_response?: string;
  admin_id?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StopArrivalRecord {
  stop_id: string;
  stop_name: string;
  sequence: number;
  arrived_at: string;
  lat: number;
  lng: number;
  distance_to_stop_m?: number;
}

export interface TripRecord {
  id: string;
  college_id: string;
  bus_id: string;
  route_id: string;
  driver_id: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  start_time: string;
  end_time?: string;
  current_occupancy: number;
  max_occupancy_recorded: number;
  distance_covered_km: number;
  total_locations_logged: number;
  synced_locations_count: number;
  queued_locations_count: number;
  current_stop_id?: string | null;
  next_stop_id?: string | null;
  completed_stop_ids?: string[];
  stop_arrivals?: StopArrivalRecord[];
  created_at: string;
}

export interface LocationRecord {
  id: string;
  trip_id: string;
  bus_id: string;
  college_id: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recorded_at: string;
  is_offline_queued: boolean;
  created_at: string;
}

export interface EmergencyAlertRecord {
  id: string;
  college_id: string;
  trip_id?: string;
  bus_id?: string;
  driver_id?: string;
  bus_number: string;
  route_name: string;
  driver_name: string;
  reason: string;
  location_lat: number;
  location_lng: number;
  timestamp: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledged_by?: string;
  resolved_by?: string;
  notes?: string;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  college_id: string;
  route_id?: string;
  title: string;
  message: string;
  category: 'ANNOUNCEMENT' | 'DELAY' | 'ROUTE_CHANGE' | 'EMERGENCY';
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  timestamp: string;
  is_read: boolean;
  created_at: string;
}

interface DatabaseData {
  colleges: CollegeRecord[];
  users: UserRecord[];
  routes: RouteRecord[];
  stops: StopRecord[];
  buses: BusRecord[];
  trips: TripRecord[];
  locations: LocationRecord[];
  emergency_alerts: EmergencyAlertRecord[];
  notifications: NotificationRecord[];
  schedules?: ScheduleRecord[];
  complaints?: ComplaintRecord[];
}

let memoryData: DatabaseData = {
  colleges: [],
  users: [],
  routes: [],
  stops: [],
  buses: [],
  trips: [],
  locations: [],
  emergency_alerts: [],
  notifications: [],
};

import os from 'os';
import { buildPgConnection } from './tls';

function getWritableDataDir(): string {
  try {
    const defaultDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return defaultDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'campusmove_data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {
      // Ignored
    }
    return tmpDir;
  }
}

// Save memory data to disk
function saveFileDb() {
  try {
    const dir = getWritableDataDir();
    const filePath = path.join(dir, 'database.json');
    fs.writeFileSync(filePath, JSON.stringify(memoryData, null, 2), 'utf-8');
  } catch {
    // In-memory state remains operational during serverless execution
  }
}

// Load memory data from disk
function loadFileDb(): boolean {
  try {
    const dir = getWritableDataDir();
    const filePath = path.join(dir, 'database.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      memoryData = JSON.parse(raw);
      return true;
    }
  } catch {
    // Fallback
  }
  return false;
}

// Generic accessors for collections kept in the file-backed store (used by schedules/complaints)
function getFileBackedData<K extends 'schedules' | 'complaints'>(key: K): NonNullable<DatabaseData[K]> {
  return ((memoryData as any)[key] ||= []) as NonNullable<DatabaseData[K]>;
}

function setFileBackedData<K extends 'schedules' | 'complaints'>(key: K, records: NonNullable<DatabaseData[K]>): void {
  (memoryData as any)[key] = records;
  saveFileDb();
}

// Seed default initial data
export async function seedInitialData() {
  const hash = await bcrypt.hash('ApexBus2025!', 10);

  const collegeApex: CollegeRecord = {
    id: 'college_apex',
    name: 'Apex State University',
    short_code: 'ASU',
    domain: 'apex.edu',
    center_lat: 34.0537,
    center_lng: -118.2570,
    zoom_level: 15,
    settings: {
      busIconColor: '#2563EB',
      emergencyPhone: '(555) 911-APEX',
      telemetryIntervalSec: 3,
      timeZone: 'America/Los_Angeles',
    },
    created_at: new Date().toISOString(),
  };

  const collegeMetro: CollegeRecord = {
    id: 'college_metro',
    name: 'Metro Polytechnic University',
    short_code: 'MPU',
    domain: 'metro.edu',
    center_lat: 37.7749,
    center_lng: -122.4194,
    zoom_level: 15,
    settings: {
      busIconColor: '#059669',
      emergencyPhone: '(555) 911-MPU',
      telemetryIntervalSec: 3,
      timeZone: 'America/Los_Angeles',
    },
    created_at: new Date().toISOString(),
  };

  const users: UserRecord[] = [
    {
      id: 'usr_student_alex',
      college_id: 'college_apex',
      email: 'alex.chen@apex.edu',
      password_hash: hash,
      name: 'Alex Chen',
      role: 'STUDENT',
      student_id: 'ASU-2024-8891',
      phone: '(555) 123-4567',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'usr_driver_marcus',
      college_id: 'college_apex',
      email: 'marcus.vance@transit.apex.edu',
      password_hash: hash,
      name: 'Marcus Vance',
      role: 'DRIVER',
      cdl_number: 'CDL-CA-98214',
      phone: '(555) 234-8901',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'usr_driver_elena',
      college_id: 'college_apex',
      email: 'elena.rostova@transit.apex.edu',
      password_hash: hash,
      name: 'Elena Rostova',
      role: 'DRIVER',
      cdl_number: 'CDL-CA-44912',
      phone: '(555) 234-8902',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'usr_admin_sarah',
      college_id: 'college_apex',
      email: 'admin@apex.edu',
      password_hash: hash,
      name: 'Sarah Jenkins',
      role: 'ADMIN',
      phone: '(555) 987-6543',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    // Metro student for cross-tenant testing
    {
      id: 'usr_student_metro',
      college_id: 'college_metro',
      email: 'jordan@metro.edu',
      password_hash: hash,
      name: 'Jordan Miller',
      role: 'STUDENT',
      student_id: 'MPU-9941',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
  ];

  const routes: RouteRecord[] = [
    {
      id: 'route_blue',
      college_id: 'college_apex',
      code: 'BL-01',
      name: 'Blue Campus Perimeter',
      description: 'Main campus loop connecting North Village, Academic Quads, and South Athletic Center',
      color: '#2563EB',
      status: 'ACTIVE',
      schedule_hours: '07:00 AM – 10:00 PM',
      frequency_minutes: 8,
      path_coordinates: [
        [34.0537, -118.2570],
        [34.0548, -118.2562],
        [34.0562, -118.2555],
        [34.0575, -118.2572],
        [34.0582, -118.2595],
        [34.0571, -118.2618],
        [34.0552, -118.2625],
        [34.0535, -118.2608],
        [34.0528, -118.2588],
        [34.0537, -118.2570],
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 'route_red',
      college_id: 'college_apex',
      code: 'RD-02',
      name: 'Red Science & Tech Connector',
      description: 'High-speed corridor linking STEM Complex, Bio-Med Labs, and Innovation Park',
      color: '#DC2626',
      status: 'ACTIVE',
      schedule_hours: '07:30 AM – 09:30 PM',
      frequency_minutes: 10,
      path_coordinates: [
        [34.0520, -118.2580],
        [34.0535, -118.2565],
        [34.0550, -118.2545],
        [34.0568, -118.2530],
        [34.0585, -118.2542],
        [34.0578, -118.2570],
        [34.0558, -118.2590],
        [34.0538, -118.2605],
        [34.0520, -118.2580],
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 'route_green',
      college_id: 'college_apex',
      code: 'GN-03',
      name: 'Green Commuter Shuttle',
      description: 'Transit hub express connecting Central Train Station, Parking Lot E, and Student Center',
      color: '#059669',
      status: 'ACTIVE',
      schedule_hours: '06:30 AM – 11:00 PM',
      frequency_minutes: 15,
      path_coordinates: [
        [34.0505, -118.2540],
        [34.0522, -118.2555],
        [34.0542, -118.2575],
        [34.0560, -118.2592],
        [34.0580, -118.2615],
        [34.0565, -118.2630],
        [34.0540, -118.2610],
        [34.0518, -118.2575],
        [34.0505, -118.2540],
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 'route_metro_express',
      college_id: 'college_metro',
      code: 'MX-01',
      name: 'Metro Campus Shuttle',
      description: 'Downtown campus connection for Metro Polytechnic',
      color: '#7C3AED',
      status: 'ACTIVE',
      schedule_hours: '07:00 AM – 09:00 PM',
      frequency_minutes: 20,
      path_coordinates: [
        [37.7749, -122.4194],
        [37.7760, -122.4180],
        [37.7775, -122.4190],
      ],
      created_at: new Date().toISOString(),
    },
  ];

  const stops: StopRecord[] = [
    {
      id: 'stop_metro_1',
      college_id: 'college_metro',
      route_id: 'route_metro_express',
      code: 'MX-S1',
      name: 'Metro Poly Center Gate',
      lat: 37.7749,
      lng: -122.4194,
      landmark: 'Main Plaza',
      sequence: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_101',
      college_id: 'college_apex',
      route_id: 'route_blue',
      code: 'BL-01',
      name: 'North Village Commons',
      lat: 34.0575,
      lng: -118.2572,
      landmark: 'Across from Residence Hall B & Student Dining',
      sequence: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_102',
      college_id: 'college_apex',
      route_id: 'route_blue',
      code: 'BL-02',
      name: 'Main Academic Quad',
      lat: 34.0552,
      lng: -118.2625,
      landmark: 'University Library West Steps',
      sequence: 2,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_103',
      college_id: 'college_apex',
      route_id: 'route_blue',
      code: 'BL-03',
      name: 'Apex Arena & Sports Complex',
      lat: 34.0528,
      lng: -118.2588,
      landmark: 'South Gate Gate 3 near Gym',
      sequence: 3,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_104',
      college_id: 'college_apex',
      route_id: 'route_blue',
      code: 'BL-04',
      name: 'Student Life Center',
      lat: 34.0537,
      lng: -118.2570,
      landmark: 'Bookstore Plaza & Bus Island',
      sequence: 4,
      created_at: new Date().toISOString(),
    },
    // Red Route Stops
    {
      id: 'stop_201',
      college_id: 'college_apex',
      route_id: 'route_red',
      code: 'RD-01',
      name: 'Innovation & Research Park',
      lat: 34.0585,
      lng: -118.2542,
      landmark: 'Building 4 Entrance',
      sequence: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_202',
      college_id: 'college_apex',
      route_id: 'route_red',
      code: 'RD-02',
      name: 'STEM Science Complex',
      lat: 34.0550,
      lng: -118.2545,
      landmark: 'Chemistry Lawn Clocktower',
      sequence: 2,
      created_at: new Date().toISOString(),
    },
    {
      id: 'stop_203',
      college_id: 'college_apex',
      route_id: 'route_red',
      code: 'RD-03',
      name: 'South Parking Structure',
      lat: 34.0520,
      lng: -118.2580,
      landmark: 'Level 1 Transit Bay',
      sequence: 3,
      created_at: new Date().toISOString(),
    },
  ];

  const buses: BusRecord[] = [
    {
      id: 'bus_104',
      college_id: 'college_apex',
      bus_number: 'BUS-104',
      plate_number: 'CA-7TXP90',
      capacity: 45,
      model: 'Proterra Catalyst 40ft Electric',
      current_route_id: 'route_blue',
      current_driver_id: 'usr_driver_marcus',
      driver_name: 'Marcus Vance',
      status: 'ACTIVE',
      last_location_lat: 34.0548,
      last_location_lng: -118.2562,
      heading: 145,
      speed_kmh: 24,
      current_occupancy: 28,
      gps_status: 'GPS_ACTIVE',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'LIVE',
      is_simulated: false,
      last_sync_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bus_101',
      college_id: 'college_apex',
      bus_number: 'BUS-101',
      plate_number: 'CA-3XKL12',
      capacity: 40,
      model: 'Gillig Low Floor 35ft Hybrid',
      current_route_id: 'route_red',
      current_driver_id: 'usr_driver_elena',
      driver_name: 'Elena Rostova',
      status: 'ACTIVE',
      last_location_lat: 34.0568,
      last_location_lng: -118.2530,
      heading: 210,
      speed_kmh: 31,
      current_occupancy: 19,
      gps_status: 'GPS_ACTIVE',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'LIVE',
      is_simulated: false,
      last_sync_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bus_102',
      college_id: 'college_apex',
      bus_number: 'BUS-102',
      plate_number: 'CA-9TRQ44',
      capacity: 55,
      model: 'New Flyer Xcelsior 60ft Articulated',
      current_route_id: 'route_green',
      status: 'IDLE',
      last_location_lat: 34.0505,
      last_location_lng: -118.2540,
      heading: 45,
      speed_kmh: 0,
      current_occupancy: 0,
      gps_status: 'GPS_SEARCHING',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'SCHEDULED',
      is_simulated: false,
      last_sync_timestamp: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bus_103',
      college_id: 'college_apex',
      bus_number: 'BUS-103',
      plate_number: 'CA-5LMN78',
      capacity: 40,
      model: 'BYD K9 Electric 40ft',
      status: 'MAINTENANCE',
      last_location_lat: 34.0510,
      last_location_lng: -118.2635,
      heading: 0,
      speed_kmh: 0,
      current_occupancy: 0,
      gps_status: 'GPS_ACTIVE',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'OFFLINE',
      is_simulated: false,
      last_sync_timestamp: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bus_metro_201',
      college_id: 'college_metro',
      bus_number: 'MPU-01',
      plate_number: 'CA-9MPU01',
      capacity: 35,
      model: 'Gillig Low Floor 35ft',
      status: 'IDLE',
      last_location_lat: 37.7749,
      last_location_lng: -122.4194,
      heading: 0,
      speed_kmh: 0,
      current_occupancy: 0,
      gps_status: 'GPS_SEARCHING',
      network_status: 'NETWORK_ONLINE',
      eta_confidence: 'SCHEDULED',
      is_simulated: false,
      last_sync_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const trips: TripRecord[] = [
    {
      id: 'trip_active_marcus',
      college_id: 'college_apex',
      bus_id: 'bus_104',
      route_id: 'route_blue',
      driver_id: 'usr_driver_marcus',
      status: 'IN_PROGRESS',
      start_time: new Date(Date.now() - 25 * 60000).toISOString(),
      current_occupancy: 28,
      max_occupancy_recorded: 34,
      distance_covered_km: 7.2,
      total_locations_logged: 48,
      synced_locations_count: 48,
      queued_locations_count: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'trip_active_elena',
      college_id: 'college_apex',
      bus_id: 'bus_101',
      route_id: 'route_red',
      driver_id: 'usr_driver_elena',
      status: 'IN_PROGRESS',
      start_time: new Date(Date.now() - 15 * 60000).toISOString(),
      current_occupancy: 19,
      max_occupancy_recorded: 24,
      distance_covered_km: 4.8,
      total_locations_logged: 32,
      synced_locations_count: 32,
      queued_locations_count: 0,
      created_at: new Date().toISOString(),
    },
  ];

  const notifications: NotificationRecord[] = [
    {
      id: 'notif_1',
      college_id: 'college_apex',
      route_id: 'route_red',
      title: 'Roadwork Notice on East Quad Ave',
      message: 'Red Line buses will detour via Innovation Parkway until 4:00 PM due to municipal water main inspection.',
      category: 'DELAY',
      priority: 'HIGH',
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 'notif_2',
      college_id: 'college_apex',
      title: 'Late Night Safe-Ride Shuttle Extended',
      message: 'Perimeter shuttles now operate until 2:00 AM on Thursdays and Fridays throughout midterms week.',
      category: 'ANNOUNCEMENT',
      priority: 'NORMAL',
      timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 'notif_3',
      college_id: 'college_apex',
      route_id: 'route_blue',
      title: 'Heavy Game Day Ridership Expected',
      message: 'Additional articulated electric shuttles dispatched to Blue Line between 4:00 PM and 7:00 PM.',
      category: 'ROUTE_CHANGE',
      priority: 'NORMAL',
      timestamp: new Date(Date.now() - 360 * 60000).toISOString(),
      is_read: true,
      created_at: new Date().toISOString(),
    },
  ];

  const emergencyAlerts: EmergencyAlertRecord[] = [
    {
      id: 'alert_demo_1',
      college_id: 'college_apex',
      trip_id: 'trip_active_marcus',
      bus_id: 'bus_104',
      driver_id: 'usr_driver_marcus',
      bus_number: 'BUS-104',
      route_name: 'Blue Campus Perimeter',
      driver_name: 'Marcus Vance',
      reason: 'Passenger Medical Attention Needed',
      location_lat: 34.0548,
      location_lng: -118.2562,
      timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
      status: 'RESOLVED',
      acknowledged_by: 'Sarah Jenkins (Dispatch)',
      resolved_by: 'Campus EMT Team (Station 2)',
      notes: 'Campus medical unit attended to student. Vitals normal. Shuttle cleared to resume route.',
      created_at: new Date().toISOString(),
    },
  ];

  memoryData = {
    colleges: [collegeApex, collegeMetro],
    users,
    routes,
    stops,
    buses,
    trips,
    locations: [],
    emergency_alerts: emergencyAlerts,
    notifications,
  };

  saveFileDb();
}

// Database initialization
export async function initDatabase(): Promise<{ isPostgres: boolean }> {
  const dbUrl = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !dbUrl) {
    throw new Error('FATAL: DATABASE_URL environment variable is strictly required in production mode. Local persistence fallback is disabled.');
  }

  if (dbUrl) {
    try {
      console.log('Connecting to PostgreSQL database...');
      const pgConn = buildPgConnection(process.env, dbUrl);
      pool = new Pool({
        connectionString: pgConn.connectionString,
        ssl: pgConn.ssl,
        max: 10,
        idleTimeoutMillis: 30000,
      });

      const client = await pool.connect();
      console.log('PostgreSQL connection established.');

      // Run schema script safely across ESM and CJS environments
      const possibleSchemaPaths = [
        path.join(process.cwd(), 'server', 'db', 'schema.sql'),
        path.join(process.cwd(), 'schema.sql'),
      ];
      try {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        possibleSchemaPaths.unshift(path.join(currentDir, 'schema.sql'));
      } catch {
        // Ignored if import.meta is unavailable
      }
      try {
        if (typeof __dirname !== 'undefined') {
          possibleSchemaPaths.unshift(path.join(__dirname, 'schema.sql'));
        }
      } catch {
        // Ignored if __dirname is undefined
      }

      const schemaSqlPath = possibleSchemaPaths.find((p) => fs.existsSync(p));
      if (schemaSqlPath) {
        const sql = fs.readFileSync(schemaSqlPath, 'utf-8');
        await client.query(sql);
        console.log(`PostgreSQL schema verified and migrated from ${schemaSqlPath}.`);
      } else {
        console.warn('PostgreSQL schema.sql could not be located in candidate paths:', possibleSchemaPaths);
      }

      // Safe, additive, repeatable migration for stop progression columns
      await client.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trips') THEN
                ALTER TABLE trips ADD COLUMN IF NOT EXISTS current_stop_id VARCHAR(64);
                ALTER TABLE trips ADD COLUMN IF NOT EXISTS next_stop_id VARCHAR(64);
                ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_stop_ids JSONB DEFAULT '[]'::jsonb;
                ALTER TABLE trips ADD COLUMN IF NOT EXISTS stop_arrivals JSONB DEFAULT '[]'::jsonb;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'buses') THEN
                ALTER TABLE buses ADD COLUMN IF NOT EXISTS current_stop_id VARCHAR(64);
                ALTER TABLE buses ADD COLUMN IF NOT EXISTS next_stop_id VARCHAR(64);
                ALTER TABLE buses ADD COLUMN IF NOT EXISTS completed_stop_ids JSONB DEFAULT '[]'::jsonb;
            END IF;
        END $$;
      `);

      if (!isProduction || process.env.SEED_INITIAL_DATA === 'true') {
        await seedPostgresData(client);
      } else {
        console.log('Production mode active: startup demo fleet seeding skipped to preserve institutional integrity.');
      }

      client.release();
      return { isPostgres: true };
    } catch (err: any) {
      pool = null;
      if (isProduction) {
        throw new Error(`FATAL: Failed to connect to PostgreSQL in production mode. Local persistence fallback is disabled. Cause: ${err?.message || err}`);
      }
      console.error('Failed to initialize PostgreSQL. Falling back to file persistence (development only):', err?.message || err);
    }
  }

  // Memory/File-backed fallback
  const loaded = loadFileDb();
  if (!loaded || memoryData.colleges.length === 0) {
    console.log('Seeding initial file database...');
    await seedInitialData();
  } else {
    console.log(`Loaded file database: ${memoryData.buses.length} buses, ${memoryData.routes.length} routes.`);
    // Refresh seed user hashes in case the stored hash is stale (e.g. after a reseeding or bcrypt cost change).
    // This prevents "Invalid credentials" after server restarts when the persisted hash doesn't match.
    const SEED_PASSWORD = 'ApexBus2025!';
    const SEED_USER_IDS = ['usr_student_alex', 'usr_driver_marcus', 'usr_driver_elena', 'usr_admin_sarah', 'usr_student_metro'];
    const seedUsers = memoryData.users.filter(u => SEED_USER_IDS.includes(u.id));
    if (seedUsers.length > 0) {
      // Verify a sample hash; if it doesn't match, refresh all seed users
      const sample = seedUsers[0];
      const valid = sample.password_hash ? await bcrypt.compare(SEED_PASSWORD, sample.password_hash) : false;
      if (!valid) {
        console.log('Refreshing stale seed user password hashes...');
        const freshHash = await bcrypt.hash(SEED_PASSWORD, 10);
        for (const u of seedUsers) {
          u.password_hash = freshHash;
        }
        saveFileDb();
        console.log('Seed user hashes refreshed and persisted.');
      }
    }
  }

  return { isPostgres: false };
}

// Production & development health checker
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; database: string; error?: string }> {
  if (pool) {
    try {
      await pool.query('SELECT 1');
      return { healthy: true, database: 'PostgreSQL' };
    } catch (err: any) {
      return { healthy: false, database: 'PostgreSQL', error: err.message || 'Health probe query failed' };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return { healthy: false, database: 'PostgreSQL', error: 'PostgreSQL pool is not connected' };
  }

  return { healthy: true, database: 'Embedded Persistence (Development Only)' };
}

// Helper to seed into Postgres when connected
export async function seedPostgresData(client: pg.PoolClient) {
  await seedInitialData(); // Populate memoryData first

  for (const col of memoryData.colleges) {
    await client.query(
      `INSERT INTO colleges (id, name, short_code, domain, center_lat, center_lng, zoom_level, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [col.id, col.name, col.short_code, col.domain, col.center_lat, col.center_lng, col.zoom_level, JSON.stringify(col.settings)]
    );
  }

  for (const u of memoryData.users) {
    await client.query(
      `INSERT INTO users (id, college_id, email, password_hash, name, role, student_id, cdl_number, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.college_id, u.email, u.password_hash, u.name, u.role, u.student_id || null, u.cdl_number || null, u.phone || null, u.status]
    );
  }

  for (const r of memoryData.routes) {
    await client.query(
      `INSERT INTO routes (id, college_id, code, name, description, color, status, schedule_hours, frequency_minutes, path_coordinates)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.college_id, r.code, r.name, r.description || null, r.color, r.status, r.schedule_hours, r.frequency_minutes, JSON.stringify(r.path_coordinates)]
    );
  }

  for (const s of memoryData.stops) {
    await client.query(
      `INSERT INTO stops (id, college_id, route_id, code, name, lat, lng, landmark, sequence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.college_id, s.route_id || null, s.code, s.name, s.lat, s.lng, s.landmark || null, s.sequence]
    );
  }

  for (const b of memoryData.buses) {
    await client.query(
      `INSERT INTO buses (id, college_id, bus_number, plate_number, capacity, model, current_route_id, current_driver_id, driver_name, status, last_location_lat, last_location_lng, heading, speed_kmh, current_occupancy, gps_status, network_status, eta_confidence, is_simulated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.college_id, b.bus_number, b.plate_number, b.capacity, b.model || null, b.current_route_id || null, b.current_driver_id || null, b.driver_name || null, b.status, b.last_location_lat, b.last_location_lng, b.heading, b.speed_kmh, b.current_occupancy, b.gps_status, b.network_status, b.eta_confidence, b.is_simulated]
    );
  }

  for (const t of memoryData.trips) {
    await client.query(
      `INSERT INTO trips (id, college_id, bus_id, route_id, driver_id, status, start_time, current_occupancy, max_occupancy_recorded, distance_covered_km, total_locations_logged, synced_locations_count, queued_locations_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.college_id, t.bus_id, t.route_id, t.driver_id, t.status, t.start_time, t.current_occupancy, t.max_occupancy_recorded, t.distance_covered_km, t.total_locations_logged, t.synced_locations_count, t.queued_locations_count]
    );
  }

  for (const n of memoryData.notifications) {
    await client.query(
      `INSERT INTO notifications (id, college_id, route_id, title, message, category, priority, timestamp, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
      [n.id, n.college_id, n.route_id || null, n.title, n.message, n.category, n.priority, n.timestamp, n.is_read]
    );
  }

  for (const a of memoryData.emergency_alerts) {
    await client.query(
      `INSERT INTO emergency_alerts (id, college_id, trip_id, bus_id, driver_id, bus_number, route_name, driver_name, reason, location_lat, location_lng, timestamp, status, acknowledged_by, resolved_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.college_id, a.trip_id || null, a.bus_id || null, a.driver_id || null, a.bus_number, a.route_name, a.driver_name, a.reason, a.location_lat, a.location_lng, a.timestamp, a.status, a.acknowledged_by || null, a.resolved_by || null, a.notes || null]
    );
  }
}
// ============================================
// SCHEDULES - Database Functions
// ============================================

export async function getSchedules(collegeId: string, busId?: string, routeId?: string, operatingDay?: string): Promise<ScheduleRecord[]> {
  if (pool) {
    try {
      let query = 'SELECT * FROM schedules WHERE college_id = $1';
      const params: any[] = [collegeId];

      if (busId) {
        query += ` AND bus_id = $${params.length + 1}`;
        params.push(busId);
      }
      if (routeId) {
        query += ` AND route_id = $${params.length + 1}`;
        params.push(routeId);
      }
      // Filter by day if provided (Monday, Tuesday, etc.)
      if (operatingDay) {
        query += ` AND operating_days @> $${params.length + 1}::jsonb`;
        params.push(JSON.stringify(operatingDay));
      }

      query += ' ORDER BY departure_time ASC';
      const result = await pool.query(query, params);
      return result.rows as ScheduleRecord[];
    } catch (error) {
      console.error('Database error fetching schedules:', error);
      throw error;
    }
  } else {
    const records: ScheduleRecord[] = getFileBackedData('schedules') || [];
    return records.filter((s) => {
      if (s.college_id !== collegeId) return false;
      if (busId && s.bus_id !== busId) return false;
      if (routeId && s.route_id !== routeId) return false;
      if (operatingDay && !s.operating_days.includes(operatingDay)) return false;
      return true;
    });
  }
}

export async function getScheduleById(scheduleId: string, collegeId: string): Promise<ScheduleRecord | null> {
  if (pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM schedules WHERE id = $1 AND college_id = $2',
        [scheduleId, collegeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database error fetching schedule:', error);
      throw error;
    }
  } else {
    const records: ScheduleRecord[] = getFileBackedData('schedules') || [];
    return records.find((s) => s.id === scheduleId && s.college_id === collegeId) || null;
  }
}

export async function createSchedule(schedule: ScheduleRecord): Promise<ScheduleRecord> {
  if (pool) {
    try {
      const result = await pool.query(
        `INSERT INTO schedules
        (id, college_id, bus_id, route_id, departure_time, arrival_time, operating_days, status, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          schedule.id,
          schedule.college_id,
          schedule.bus_id,
          schedule.route_id,
          schedule.departure_time,
          schedule.arrival_time || null,
          JSON.stringify(schedule.operating_days),
          schedule.status,
          schedule.notes || null,
          schedule.created_at,
          schedule.updated_at,
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Database error creating schedule:', error);
      throw error;
    }
  } else {
    const records: ScheduleRecord[] = getFileBackedData('schedules') || [];
    records.push(schedule);
    setFileBackedData('schedules', records);
    return schedule;
  }
}

export async function updateSchedule(scheduleId: string, collegeId: string, updates: Partial<ScheduleRecord>): Promise<ScheduleRecord | null> {
  if (pool) {
    try {
      const allowed = ['departure_time', 'arrival_time', 'operating_days', 'status', 'notes'];
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(key === 'operating_days' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) return getScheduleById(scheduleId, collegeId);

      setClauses.push(`updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      paramIndex++;

      values.push(scheduleId, collegeId);

      const result = await pool.query(
        `UPDATE schedules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND college_id = $${paramIndex + 1} RETURNING *`,
        values
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database error updating schedule:', error);
      throw error;
    }
  } else {
    const records: ScheduleRecord[] = getFileBackedData('schedules') || [];
    const index = records.findIndex((s) => s.id === scheduleId && s.college_id === collegeId);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates, updated_at: new Date().toISOString() };
    setFileBackedData('schedules', records);
    return records[index];
  }
}

export async function deleteSchedule(scheduleId: string, collegeId: string): Promise<boolean> {
  if (pool) {
    try {
      const result = await pool.query(
        'DELETE FROM schedules WHERE id = $1 AND college_id = $2 RETURNING id',
        [scheduleId, collegeId]
      );
      return result.rowCount !== 0;
    } catch (error) {
      console.error('Database error deleting schedule:', error);
      throw error;
    }
  } else {
    const records: ScheduleRecord[] = getFileBackedData('schedules') || [];
    const index = records.findIndex((s) => s.id === scheduleId && s.college_id === collegeId);
    if (index === -1) return false;
    records.splice(index, 1);
    setFileBackedData('schedules', records);
    return true;
  }
}

// ============================================
// COMPLAINTS - Database Functions
// ============================================

export async function getComplaints(collegeId: string, studentId?: string, status?: string): Promise<ComplaintRecord[]> {
  if (pool) {
    try {
      let query = 'SELECT * FROM complaints WHERE college_id = $1';
      const params: any[] = [collegeId];

      if (studentId) {
        query += ` AND student_id = $${params.length + 1}`;
        params.push(studentId);
      }
      if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      return result.rows as ComplaintRecord[];
    } catch (error) {
      console.error('Database error fetching complaints:', error);
      throw error;
    }
  } else {
    const records: ComplaintRecord[] = getFileBackedData('complaints') || [];
    return records.filter((c) => {
      if (c.college_id !== collegeId) return false;
      if (studentId && c.student_id !== studentId) return false;
      if (status && c.status !== status) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function getComplaintById(complaintId: string, collegeId: string): Promise<ComplaintRecord | null> {
  if (pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM complaints WHERE id = $1 AND college_id = $2',
        [complaintId, collegeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database error fetching complaint:', error);
      throw error;
    }
  } else {
    const records: ComplaintRecord[] = getFileBackedData('complaints') || [];
    return records.find((c) => c.id === complaintId && c.college_id === collegeId) || null;
  }
}

export async function createComplaint(complaint: ComplaintRecord): Promise<ComplaintRecord> {
  if (pool) {
    try {
      const result = await pool.query(
        `INSERT INTO complaints
        (id, college_id, student_id, trip_id, bus_id, route_id, title, description, category, status, priority, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          complaint.id,
          complaint.college_id,
          complaint.student_id,
          complaint.trip_id || null,
          complaint.bus_id || null,
          complaint.route_id || null,
          complaint.title,
          complaint.description,
          complaint.category,
          complaint.status,
          complaint.priority,
          complaint.created_at,
          complaint.updated_at,
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Database error creating complaint:', error);
      throw error;
    }
  } else {
    const records: ComplaintRecord[] = getFileBackedData('complaints') || [];
    records.push(complaint);
    setFileBackedData('complaints', records);
    return complaint;
  }
}

export async function updateComplaint(complaintId: string, collegeId: string, updates: Partial<ComplaintRecord>): Promise<ComplaintRecord | null> {
  if (pool) {
    try {
      const allowed = ['status', 'admin_response', 'admin_id', 'responded_at', 'priority'];
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) return getComplaintById(complaintId, collegeId);

      setClauses.push(`updated_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      paramIndex++;

      values.push(complaintId, collegeId);

      const result = await pool.query(
        `UPDATE complaints SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND college_id = $${paramIndex + 1} RETURNING *`,
        values
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database error updating complaint:', error);
      throw error;
    }
  } else {
    const records: ComplaintRecord[] = getFileBackedData('complaints') || [];
    const index = records.findIndex((c) => c.id === complaintId && c.college_id === collegeId);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates, updated_at: new Date().toISOString() };
    setFileBackedData('complaints', records);
    return records[index];
  }
}

export async function deleteComplaint(complaintId: string, collegeId: string): Promise<boolean> {
  if (pool) {
    try {
      const result = await pool.query(
        'DELETE FROM complaints WHERE id = $1 AND college_id = $2 RETURNING id',
        [complaintId, collegeId]
      );
      return result.rowCount !== 0;
    } catch (error) {
      console.error('Database error deleting complaint:', error);
      throw error;
    }
  } else {
    const records: ComplaintRecord[] = getFileBackedData('complaints') || [];
    const index = records.findIndex((c) => c.id === complaintId && c.college_id === collegeId);
    if (index === -1) return false;
    records.splice(index, 1);
    setFileBackedData('complaints', records);
    return true;
  }
}


function normalizeTripRecord(r: any): TripRecord {
  if (!r) return r;
  let completed_stop_ids: string[] = [];
  if (Array.isArray(r.completed_stop_ids)) {
    completed_stop_ids = r.completed_stop_ids;
  } else if (typeof r.completed_stop_ids === 'string') {
    try {
      completed_stop_ids = JSON.parse(r.completed_stop_ids);
    } catch {
      completed_stop_ids = [];
    }
  }

  let stop_arrivals: StopArrivalRecord[] = [];
  if (Array.isArray(r.stop_arrivals)) {
    stop_arrivals = r.stop_arrivals;
  } else if (typeof r.stop_arrivals === 'string') {
    try {
      stop_arrivals = JSON.parse(r.stop_arrivals);
    } catch {
      stop_arrivals = [];
    }
  }

  return {
    ...r,
    current_stop_id: r.current_stop_id ?? null,
    next_stop_id: r.next_stop_id ?? null,
    completed_stop_ids,
    stop_arrivals,
  };
}

function normalizeBusRecord(r: any): BusRecord {
  if (!r) return r;
  let completed_stop_ids: string[] = [];
  if (Array.isArray(r.completed_stop_ids)) {
    completed_stop_ids = r.completed_stop_ids;
  } else if (typeof r.completed_stop_ids === 'string') {
    try {
      completed_stop_ids = JSON.parse(r.completed_stop_ids);
    } catch {
      completed_stop_ids = [];
    }
  }

  return {
    ...r,
    current_stop_id: r.current_stop_id ?? null,
    next_stop_id: r.next_stop_id ?? null,
    completed_stop_ids,
  };
}

// -------------------------------------------------------------
// Unified Repository Operations (Auto-routes to Postgres or Memory)
// -------------------------------------------------------------

export const db = {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  // Colleges
  async getColleges(): Promise<CollegeRecord[]> {
    if (pool) {
      const res = await pool.query('SELECT * FROM colleges ORDER BY name ASC');
      return res.rows.map((r) => ({
        ...r,
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings,
      }));
    }
    return [...memoryData.colleges];
  },

  async getCollegeById(id: string): Promise<CollegeRecord | null> {
    if (pool) {
      const res = await pool.query('SELECT * FROM colleges WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings,
      };
    }
    return memoryData.colleges.find((c) => c.id === id) || null;
  },

  async updateCollege(id: string, updates: Partial<CollegeRecord>): Promise<CollegeRecord | null> {
    if (pool) {
      const allowed = ['name', 'domain', 'center_lat', 'center_lng', 'zoom_level', 'settings'];
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(key === 'settings' ? (typeof value === 'string' ? value : JSON.stringify(value)) : value);
          paramIndex++;
        }
      }
      if (setClauses.length === 0) return this.getCollegeById(id);
      values.push(id);
      const res = await pool.query(
        `UPDATE colleges SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings,
      };
    }
    const idx = memoryData.colleges.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    memoryData.colleges[idx] = { ...memoryData.colleges[idx], ...updates };
    saveFileDb();
    return memoryData.colleges[idx];
  },

  // Users
  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const norm = email.trim().toLowerCase();
    if (pool) {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [norm]);
      return res.rows[0] || null;
    }
    return memoryData.users.find((u) => u.email.toLowerCase() === norm) || null;
  },

  async getUserById(id: string): Promise<UserRecord | null> {
    if (pool) {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return res.rows[0] || null;
    }
    return memoryData.users.find((u) => u.id === id) || null;
  },

  async getUsersByCollege(collegeId: string, role?: string): Promise<UserRecord[]> {
    if (pool) {
      let query = 'SELECT * FROM users WHERE college_id = $1';
      const params: any[] = [collegeId];
      if (role) {
        query += ' AND role = $2';
        params.push(role);
      }
      query += ' ORDER BY name ASC';
      const res = await pool.query(query, params);
      return res.rows;
    }
    return memoryData.users.filter((u) => u.college_id === collegeId && (!role || u.role === role));
  },

  async createUser(user: UserRecord): Promise<UserRecord> {
    if (pool) {
      await pool.query(
        `INSERT INTO users (id, college_id, email, password_hash, name, role, student_id, cdl_number, phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [user.id, user.college_id, user.email, user.password_hash, user.name, user.role, user.student_id || null, user.cdl_number || null, user.phone || null, user.status]
      );
    } else {
      memoryData.users.push(user);
      saveFileDb();
    }
    return user;
  },

  async updateUser(id: string, collegeId: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
    if (pool) {
      const allowed = ['name', 'phone', 'cdl_number', 'student_id', 'status', 'password_hash'];
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }
      if (setClauses.length === 0) return this.getUserById(id);
      values.push(id, collegeId);
      const res = await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND college_id = $${paramIndex + 1} RETURNING *`,
        values
      );
      return res.rows[0] || null;
    }
    const idx = memoryData.users.findIndex((u) => u.id === id && u.college_id === collegeId);
    if (idx === -1) return null;
    memoryData.users[idx] = { ...memoryData.users[idx], ...updates };
    saveFileDb();
    return memoryData.users[idx];
  },

  async deleteUser(id: string, collegeId: string): Promise<boolean> {
    if (pool) {
      const res = await pool.query('DELETE FROM users WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return (res.rowCount ?? 0) > 0;
    }
    const lenBefore = memoryData.users.length;
    memoryData.users = memoryData.users.filter((u) => !(u.id === id && u.college_id === collegeId));
    saveFileDb();
    return memoryData.users.length < lenBefore;
  },

  // Routes
  async getRoutes(collegeId: string): Promise<RouteRecord[]> {
    if (pool) {
      const res = await pool.query('SELECT * FROM routes WHERE college_id = $1 ORDER BY code ASC', [collegeId]);
      return res.rows.map((r) => ({
        ...r,
        path_coordinates: typeof r.path_coordinates === 'string' ? JSON.parse(r.path_coordinates) : r.path_coordinates,
      }));
    }
    return memoryData.routes.filter((r) => r.college_id === collegeId);
  },

  async getRouteById(id: string, collegeId: string): Promise<RouteRecord | null> {
    if (pool) {
      const res = await pool.query('SELECT * FROM routes WHERE id = $1 AND college_id = $2', [id, collegeId]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        path_coordinates: typeof r.path_coordinates === 'string' ? JSON.parse(r.path_coordinates) : r.path_coordinates,
      };
    }
    return memoryData.routes.find((r) => r.id === id && r.college_id === collegeId) || null;
  },

  async createRoute(route: RouteRecord): Promise<RouteRecord> {
    if (pool) {
      await pool.query(
        `INSERT INTO routes (id, college_id, code, name, description, color, status, schedule_hours, frequency_minutes, path_coordinates)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [route.id, route.college_id, route.code, route.name, route.description || null, route.color, route.status, route.schedule_hours, route.frequency_minutes, JSON.stringify(route.path_coordinates)]
      );
    } else {
      memoryData.routes.push(route);
      saveFileDb();
    }
    return route;
  },

  async updateRoute(id: string, collegeId: string, updates: Partial<RouteRecord>): Promise<RouteRecord | null> {
    if (pool) {
      const current = await this.getRouteById(id, collegeId);
      if (!current) return null;
      const merged = { ...current, ...updates };
      await pool.query(
        `UPDATE routes SET code = $1, name = $2, description = $3, color = $4, status = $5, schedule_hours = $6, frequency_minutes = $7, path_coordinates = $8
         WHERE id = $9 AND college_id = $10`,
        [merged.code, merged.name, merged.description || null, merged.color, merged.status, merged.schedule_hours, merged.frequency_minutes, JSON.stringify(merged.path_coordinates), id, collegeId]
      );
      return merged;
    }
    const idx = memoryData.routes.findIndex((r) => r.id === id && r.college_id === collegeId);
    if (idx === -1) return null;
    memoryData.routes[idx] = { ...memoryData.routes[idx], ...updates };
    saveFileDb();
    return memoryData.routes[idx];
  },

  async deleteRoute(id: string, collegeId: string): Promise<boolean> {
    if (pool) {
      const res = await pool.query('DELETE FROM routes WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return (res.rowCount ?? 0) > 0;
    }
    const lenBefore = memoryData.routes.length;
    memoryData.routes = memoryData.routes.filter((r) => !(r.id === id && r.college_id === collegeId));
    if (memoryData.routes.length !== lenBefore) {
      memoryData.stops = memoryData.stops.filter((s) => s.route_id !== id);
      saveFileDb();
      return true;
    }
    return false;
  },

  // Stops
  async getStops(collegeId: string, routeId?: string): Promise<StopRecord[]> {
    if (pool) {
      let query = 'SELECT * FROM stops WHERE college_id = $1';
      const params: any[] = [collegeId];
      if (routeId) {
        query += ' AND route_id = $2';
        params.push(routeId);
      }
      query += ' ORDER BY sequence ASC';
      const res = await pool.query(query, params);
      return res.rows;
    }
    return memoryData.stops
      .filter((s) => s.college_id === collegeId && (!routeId || s.route_id === routeId))
      .sort((a, b) => a.sequence - b.sequence);
  },

  async createStop(stop: StopRecord): Promise<StopRecord> {
    if (pool) {
      await pool.query(
        `INSERT INTO stops (id, college_id, route_id, code, name, lat, lng, landmark, sequence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [stop.id, stop.college_id, stop.route_id || null, stop.code, stop.name, stop.lat, stop.lng, stop.landmark || null, stop.sequence]
      );
    } else {
      memoryData.stops.push(stop);
      saveFileDb();
    }
    return stop;
  },

  async updateStop(id: string, collegeId: string, updates: Partial<StopRecord>): Promise<StopRecord | null> {
    if (pool) {
      const res = await pool.query('SELECT * FROM stops WHERE id = $1 AND college_id = $2', [id, collegeId]);
      if (res.rows.length === 0) return null;
      const merged = { ...res.rows[0], ...updates };
      await pool.query(
        `UPDATE stops SET code = $1, name = $2, lat = $3, lng = $4, landmark = $5, sequence = $6 WHERE id = $7 AND college_id = $8`,
        [merged.code, merged.name, merged.lat, merged.lng, merged.landmark || null, merged.sequence, id, collegeId]
      );
      return merged;
    }
    const idx = memoryData.stops.findIndex((s) => s.id === id && s.college_id === collegeId);
    if (idx === -1) return null;
    memoryData.stops[idx] = { ...memoryData.stops[idx], ...updates };
    saveFileDb();
    return memoryData.stops[idx];
  },

  async deleteStop(id: string, collegeId: string): Promise<boolean> {
    if (pool) {
      const res = await pool.query('DELETE FROM stops WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return (res.rowCount ?? 0) > 0;
    }
    const lenBefore = memoryData.stops.length;
    memoryData.stops = memoryData.stops.filter((s) => !(s.id === id && s.college_id === collegeId));
    if (memoryData.stops.length !== lenBefore) {
      saveFileDb();
      return true;
    }
    return false;
  },

  // Buses
  async getBuses(collegeId: string, filterRouteId?: string): Promise<BusRecord[]> {
    if (pool) {
      let query = 'SELECT * FROM buses WHERE college_id = $1';
      const params: any[] = [collegeId];
      if (filterRouteId) {
        query += ' AND current_route_id = $2';
        params.push(filterRouteId);
      }
      query += ' ORDER BY bus_number ASC';
      const res = await pool.query(query, params);
      return res.rows.map(normalizeBusRecord);
    }
    return memoryData.buses.filter((b) => b.college_id === collegeId && (!filterRouteId || b.current_route_id === filterRouteId)).map(normalizeBusRecord);
  },

  async getBusById(id: string, collegeId?: string): Promise<BusRecord | null> {
    if (pool) {
      let query = 'SELECT * FROM buses WHERE id = $1';
      const params: any[] = [id];
      if (collegeId) {
        query += ' AND college_id = $2';
        params.push(collegeId);
      }
      const res = await pool.query(query, params);
      return res.rows[0] ? normalizeBusRecord(res.rows[0]) : null;
    }
    const b = memoryData.buses.find((b) => b.id === id && (!collegeId || b.college_id === collegeId));
    return b ? normalizeBusRecord(b) : null;
  },

  async createBus(bus: BusRecord): Promise<BusRecord> {
    if (pool) {
      await pool.query(
        `INSERT INTO buses (id, college_id, bus_number, plate_number, capacity, model, current_route_id, current_driver_id, driver_name, status, last_location_lat, last_location_lng, heading, speed_kmh, current_occupancy, gps_status, network_status, eta_confidence, is_simulated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [bus.id, bus.college_id, bus.bus_number, bus.plate_number, bus.capacity, bus.model || null, bus.current_route_id || null, bus.current_driver_id || null, bus.driver_name || null, bus.status, bus.last_location_lat, bus.last_location_lng, bus.heading, bus.speed_kmh, bus.current_occupancy, bus.gps_status, bus.network_status, bus.eta_confidence, bus.is_simulated]
      );
    } else {
      memoryData.buses.push(bus);
      saveFileDb();
    }
    return normalizeBusRecord(bus);
  },

  async updateBus(id: string, collegeId: string, updates: Partial<BusRecord>): Promise<BusRecord | null> {
    if (pool) {
      const keys = Object.keys(updates).filter((k) => k !== 'id' && k !== 'college_id');
      if (keys.length === 0) return this.getBusById(id, collegeId);

      const setClause = keys.map((k, idx) => {
        if (k === 'completed_stop_ids') {
          return `${k} = $${idx + 3}::jsonb`;
        }
        return `${k} = $${idx + 3}`;
      }).join(', ');
      const values = keys.map((k) => {
        const val = (updates as any)[k];
        if (k === 'completed_stop_ids' && typeof val !== 'string') {
          return JSON.stringify(val);
        }
        return val;
      });

      const res = await pool.query(
        `UPDATE buses SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND college_id = $2 RETURNING *`,
        [id, collegeId, ...values]
      );
      return res.rows[0] ? normalizeBusRecord(res.rows[0]) : null;
    }

    const idx = memoryData.buses.findIndex((b) => b.id === id && b.college_id === collegeId);
    if (idx === -1) return null;

    memoryData.buses[idx] = {
      ...memoryData.buses[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveFileDb();
    return normalizeBusRecord(memoryData.buses[idx]);
  },

  async deleteBus(id: string, collegeId: string): Promise<boolean> {
    if (pool) {
      const res = await pool.query('DELETE FROM buses WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return (res.rowCount ?? 0) > 0;
    }
    const lenBefore = memoryData.buses.length;
    memoryData.buses = memoryData.buses.filter((b) => !(b.id === id && b.college_id === collegeId));
    saveFileDb();
    return memoryData.buses.length < lenBefore;
  },

  // Trips
  async getActiveTripForDriver(driverId: string, collegeId: string): Promise<TripRecord | null> {
    if (pool) {
      const res = await pool.query(
        'SELECT * FROM trips WHERE driver_id = $1 AND college_id = $2 AND status IN (\'STARTED\', \'IN_PROGRESS\') ORDER BY start_time DESC LIMIT 1',
        [driverId, collegeId]
      );
      return res.rows[0] ? normalizeTripRecord(res.rows[0]) : null;
    }
    const trip = memoryData.trips
      .filter(
        (t) => t.driver_id === driverId && t.college_id === collegeId && (t.status === 'STARTED' || t.status === 'IN_PROGRESS')
      )
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0];
    return trip ? normalizeTripRecord(trip) : null;
  },

  async getActiveTripForBus(busId: string, collegeId: string): Promise<TripRecord | null> {
    if (pool) {
      const res = await pool.query(
        'SELECT * FROM trips WHERE bus_id = $1 AND college_id = $2 AND status IN (\'STARTED\', \'IN_PROGRESS\') ORDER BY start_time DESC LIMIT 1',
        [busId, collegeId]
      );
      return res.rows[0] ? normalizeTripRecord(res.rows[0]) : null;
    }
    const trip = memoryData.trips.find(
      (t) => t.bus_id === busId && t.college_id === collegeId && (t.status === 'STARTED' || t.status === 'IN_PROGRESS')
    );
    return trip ? normalizeTripRecord(trip) : null;
  },

  async getTrips(collegeId: string, driverId?: string): Promise<TripRecord[]> {
    if (pool) {
      let query = 'SELECT * FROM trips WHERE college_id = $1';
      const params: any[] = [collegeId];
      if (driverId) {
        query += ' AND driver_id = $2';
        params.push(driverId);
      }
      query += ' ORDER BY start_time DESC';
      const res = await pool.query(query, params);
      return res.rows.map(normalizeTripRecord);
    }
    return memoryData.trips
      .filter((t) => t.college_id === collegeId && (!driverId || t.driver_id === driverId))
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .map(normalizeTripRecord);
  },

  async createTrip(trip: TripRecord): Promise<TripRecord> {
    const fullTrip: TripRecord = {
      ...trip,
      current_stop_id: trip.current_stop_id ?? null,
      next_stop_id: trip.next_stop_id ?? null,
      completed_stop_ids: trip.completed_stop_ids || [],
      stop_arrivals: trip.stop_arrivals || [],
    };
    if (pool) {
      await pool.query(
        `INSERT INTO trips (id, college_id, bus_id, route_id, driver_id, status, start_time, current_occupancy, max_occupancy_recorded, distance_covered_km, total_locations_logged, synced_locations_count, queued_locations_count, current_stop_id, next_stop_id, completed_stop_ids, stop_arrivals)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          fullTrip.id,
          fullTrip.college_id,
          fullTrip.bus_id,
          fullTrip.route_id,
          fullTrip.driver_id,
          fullTrip.status,
          fullTrip.start_time,
          fullTrip.current_occupancy,
          fullTrip.max_occupancy_recorded,
          fullTrip.distance_covered_km,
          fullTrip.total_locations_logged,
          fullTrip.synced_locations_count,
          fullTrip.queued_locations_count,
          fullTrip.current_stop_id || null,
          fullTrip.next_stop_id || null,
          JSON.stringify(fullTrip.completed_stop_ids || []),
          JSON.stringify(fullTrip.stop_arrivals || []),
        ]
      );
    } else {
      memoryData.trips.unshift(fullTrip);
      saveFileDb();
    }
    return normalizeTripRecord(fullTrip);
  },

  async updateTrip(id: string, collegeId: string, updates: Partial<TripRecord>): Promise<TripRecord | null> {
    if (pool) {
      const keys = Object.keys(updates).filter((k) => k !== 'id' && k !== 'college_id');
      if (keys.length === 0) return this.getTripById(id, collegeId);

      const setClause = keys.map((k, idx) => {
        if (k === 'completed_stop_ids' || k === 'stop_arrivals') {
          return `${k} = $${idx + 3}::jsonb`;
        }
        return `${k} = $${idx + 3}`;
      }).join(', ');
      const values = keys.map((k) => {
        const val = (updates as any)[k];
        if ((k === 'completed_stop_ids' || k === 'stop_arrivals') && typeof val !== 'string') {
          return JSON.stringify(val);
        }
        return val;
      });

      const res = await pool.query(
        `UPDATE trips SET ${setClause} WHERE id = $1 AND college_id = $2 RETURNING *`,
        [id, collegeId, ...values]
      );
      return res.rows[0] ? normalizeTripRecord(res.rows[0]) : null;
    }

    const matches = memoryData.trips
      .map((t, idx) => (t.id === id && t.college_id === collegeId ? idx : -1))
      .filter((idx) => idx !== -1);
    if (matches.length === 0) return null;

    let last = memoryData.trips[matches[0]];
    for (const idx of matches) {
      memoryData.trips[idx] = {
        ...memoryData.trips[idx],
        ...updates,
      };
      last = memoryData.trips[idx];
    }
    saveFileDb();
    return normalizeTripRecord(last);
  },

  async getTripById(id: string, collegeId: string): Promise<TripRecord | null> {
    if (pool) {
      const res = await pool.query('SELECT * FROM trips WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return res.rows[0] ? normalizeTripRecord(res.rows[0]) : null;
    }
    const trip = memoryData.trips.find((t) => t.id === id && t.college_id === collegeId);
    return trip ? normalizeTripRecord(trip) : null;
  },

  async executeWithTripLock<T>(
    id: string,
    collegeId: string,
    operation: (
      lockedTrip: TripRecord,
      updateFn: (updates: Partial<TripRecord>) => Promise<TripRecord | null>
    ) => Promise<T>
  ): Promise<T | null> {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          'SELECT * FROM trips WHERE id = $1 AND college_id = $2 FOR UPDATE',
          [id, collegeId]
        );
        if (!res.rows[0]) {
          await client.query('ROLLBACK');
          return null;
        }
        const lockedTrip = normalizeTripRecord(res.rows[0]);
        const updateLocked = async (updates: Partial<TripRecord>): Promise<TripRecord | null> => {
          const keys = Object.keys(updates).filter((k) => k !== 'id' && k !== 'college_id');
          if (keys.length === 0) return lockedTrip;

          const setClause = keys
            .map((k, idx) => {
              if (k === 'completed_stop_ids' || k === 'stop_arrivals') {
                return `${k} = $${idx + 3}::jsonb`;
              }
              return `${k} = $${idx + 3}`;
            })
            .join(', ');
          const values = keys.map((k) => {
            const val = (updates as any)[k];
            if ((k === 'completed_stop_ids' || k === 'stop_arrivals') && typeof val !== 'string') {
              return JSON.stringify(val);
            }
            return val;
          });

          const updateRes = await client.query(
            `UPDATE trips SET ${setClause} WHERE id = $1 AND college_id = $2 RETURNING *`,
            [id, collegeId, ...values]
          );
          return updateRes.rows[0] ? normalizeTripRecord(updateRes.rows[0]) : null;
        };

        const result = await operation(lockedTrip, updateLocked);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const trip = await this.getTripById(id, collegeId);
    if (!trip) return null;
    const updateMem = async (updates: Partial<TripRecord>) => {
      return this.updateTrip(id, collegeId, updates);
    };
    return operation(trip, updateMem);
  },

  // Locations / GPS Breadcrumbs
  async saveLocation(loc: LocationRecord): Promise<boolean> {
    if (pool) {
      let validTripId: string | null = null;
      if (loc.trip_id && loc.trip_id !== 'no_trip') {
        const tripCheck = await pool.query('SELECT 1 FROM trips WHERE id = $1', [loc.trip_id]);
        if ((tripCheck.rowCount ?? 0) > 0) {
          validTripId = loc.trip_id;
        }
      }

      const res = await pool.query(
        `INSERT INTO locations (id, trip_id, bus_id, college_id, lat, lng, speed, heading, accuracy, recorded_at, is_offline_queued)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [loc.id, validTripId, loc.bus_id, loc.college_id, loc.lat, loc.lng, loc.speed || null, loc.heading || null, loc.accuracy || null, loc.recorded_at, loc.is_offline_queued]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      // Duplicate prevention by unique ID or identical timestamp + coordinates
      const isDuplicate = memoryData.locations.some(
        (existing) =>
          existing.id === loc.id ||
          (existing.bus_id === loc.bus_id &&
            Math.abs(new Date(existing.recorded_at).getTime() - new Date(loc.recorded_at).getTime()) < 500 &&
            Math.abs(existing.lat - loc.lat) < 0.00001 &&
            Math.abs(existing.lng - loc.lng) < 0.00001)
      );

      if (isDuplicate) {
        return false;
      }

      memoryData.locations.push(loc);
      // Keep memory bound to last 2000 points
      if (memoryData.locations.length > 2000) {
        memoryData.locations = memoryData.locations.slice(-2000);
      }
      saveFileDb();
      return true;
    }
  },

  async saveLocationBatch(locations: LocationRecord[]): Promise<number> {
    if (locations.length === 0) return 0;

    let saved = 0;
    for (const loc of locations) {
      try {
        const wasSaved = await this.saveLocation(loc);
        if (wasSaved) {
          saved++;
        }
      } catch (err) {
        console.error('Error saving batched location:', err);
      }
    }
    return saved;
  },

  // Emergency Alerts
  async getEmergencyAlerts(collegeId: string): Promise<EmergencyAlertRecord[]> {
    if (pool) {
      const res = await pool.query('SELECT * FROM emergency_alerts WHERE college_id = $1 ORDER BY timestamp DESC', [collegeId]);
      return res.rows;
    }
    return memoryData.emergency_alerts
      .filter((a) => a.college_id === collegeId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async createEmergencyAlert(alert: EmergencyAlertRecord): Promise<EmergencyAlertRecord> {
    if (pool) {
      let validTripId: string | null = null;
      if (alert.trip_id && alert.trip_id !== 'no_trip') {
        const tripCheck = await pool.query('SELECT 1 FROM trips WHERE id = $1', [alert.trip_id]);
        if ((tripCheck.rowCount ?? 0) > 0) {
          validTripId = alert.trip_id;
        }
      }

      let validBusId: string | null = null;
      if (alert.bus_id) {
        const busCheck = await pool.query('SELECT 1 FROM buses WHERE id = $1', [alert.bus_id]);
        if ((busCheck.rowCount ?? 0) > 0) {
          validBusId = alert.bus_id;
        }
      }

      await pool.query(
        `INSERT INTO emergency_alerts (id, college_id, trip_id, bus_id, driver_id, bus_number, route_name, driver_name, reason, location_lat, location_lng, timestamp, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [alert.id, alert.college_id, validTripId, validBusId, alert.driver_id || null, alert.bus_number, alert.route_name, alert.driver_name, alert.reason, alert.location_lat, alert.location_lng, alert.timestamp, alert.status]
      );
    } else {
      memoryData.emergency_alerts.unshift(alert);
      saveFileDb();
    }
    return alert;
  },

  async updateEmergencyAlert(id: string, collegeId: string, updates: Partial<EmergencyAlertRecord>): Promise<EmergencyAlertRecord | null> {
    if (pool) {
      const keys = Object.keys(updates).filter((k) => k !== 'id' && k !== 'college_id');
      if (keys.length === 0) return null;

      const setClause = keys.map((k, idx) => `${k} = $${idx + 3}`).join(', ');
      const values = keys.map((k) => (updates as any)[k]);

      const res = await pool.query(
        `UPDATE emergency_alerts SET ${setClause} WHERE id = $1 AND college_id = $2 RETURNING *`,
        [id, collegeId, ...values]
      );
      return res.rows[0] || null;
    }

    const idx = memoryData.emergency_alerts.findIndex((a) => a.id === id && a.college_id === collegeId);
    if (idx === -1) return null;

    memoryData.emergency_alerts[idx] = {
      ...memoryData.emergency_alerts[idx],
      ...updates,
    };
    saveFileDb();
    return memoryData.emergency_alerts[idx];
  },

  // Notifications
  async getNotifications(collegeId: string, routeId?: string): Promise<NotificationRecord[]> {
    if (pool) {
      let query = 'SELECT * FROM notifications WHERE college_id = $1';
      const params: any[] = [collegeId];
      if (routeId) {
        query += ' AND (route_id IS NULL OR route_id = $2)';
        params.push(routeId);
      }
      query += ' ORDER BY timestamp DESC';
      const res = await pool.query(query, params);
      return res.rows;
    }
    return memoryData.notifications
      .filter((n) => n.college_id === collegeId && (!routeId || !n.route_id || n.route_id === routeId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async createNotification(notif: NotificationRecord): Promise<NotificationRecord> {
    if (pool) {
      await pool.query(
        `INSERT INTO notifications (id, college_id, route_id, title, message, category, priority, timestamp, is_read)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [notif.id, notif.college_id, notif.route_id || null, notif.title, notif.message, notif.category, notif.priority, notif.timestamp, notif.is_read]
      );
    } else {
      memoryData.notifications.unshift(notif);
      saveFileDb();
    }
    return notif;
  },

  async markNotificationRead(id: string, collegeId: string): Promise<boolean> {
    if (pool) {
      const res = await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND college_id = $2', [id, collegeId]);
      return (res.rowCount ?? 0) > 0;
    }
    const notif = memoryData.notifications.find((n) => n.id === id && n.college_id === collegeId);
    if (notif) {
      notif.is_read = true;
      saveFileDb();
      return true;
    }
    return false;
  },

  // Analytics
  async getAnalytics(collegeId: string) {
    const [buses, routes, trips, alerts] = await Promise.all([
      this.getBuses(collegeId),
      this.getRoutes(collegeId),
      this.getTrips(collegeId),
      this.getEmergencyAlerts(collegeId),
    ]);

    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const completed = trips.filter((t) => t.status === 'COMPLETED');

    return {
      fleetSize: buses.length,
      activeBusesCount: buses.filter((b) => b.status === 'ACTIVE').length,
      routesCount: routes.length,
      completedTripsToday: completed.filter((t) => t.end_time && new Date(t.end_time) >= startOfDayUtc).length,
      completedTripsTotal: completed.length,
      activeTripsCount: trips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'STARTED').length,
      activeEmergenciesCount: alerts.filter((a) => a.status === 'ACTIVE').length,
      totalDistanceCoveredKm: Math.round(trips.reduce((acc, t) => acc + (t.distance_covered_km || 0), 0) * 10) / 10,
      // No schedule-adherence, boarding or GPS-quality measurements are collected yet,
      // so these are reported as unavailable instead of invented.
      onTimeRatePercent: null as number | null,
      gpsReliabilityPercent: null as number | null,
      totalPassengers: null as number | null,
    };
  },
};
