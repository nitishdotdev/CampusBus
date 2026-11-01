CREATE SCHEMA IF NOT EXISTS v1;

CREATE TABLE IF NOT EXISTS v1.campuses (
  id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  short_code VARCHAR(16) NOT NULL,
  city VARCHAR(120) NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  zoom INTEGER NOT NULL DEFAULT 15,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campuses_short_code_key UNIQUE (short_code)
);

CREATE TABLE IF NOT EXISTS v1.users (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL REFERENCES v1.campuses(id),
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('STUDENT', 'DRIVER', 'ADMIN')),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED')),
  email_verified_at TIMESTAMPTZ,
  assigned_bus_id VARCHAR(24),
  assigned_route_id VARCHAR(24),
  phone VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_campus_email_key UNIQUE (campus_id, email)
);

CREATE TABLE IF NOT EXISTS v1.refresh_tokens (
  id VARCHAR(24) PRIMARY KEY,
  user_id VARCHAR(24) NOT NULL,
  campus_id VARCHAR(24) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  family_id VARCHAR(64) NOT NULL,
  previous_id VARCHAR(64),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS v1.email_tokens (
  user_id VARCHAR(24) NOT NULL,
  campus_id VARCHAR(24) NOT NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, purpose),
  CONSTRAINT email_tokens_hash_purpose_key UNIQUE (token_hash, purpose)
);

CREATE TABLE IF NOT EXISTS v1.routes (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL REFERENCES v1.campuses(id),
  code VARCHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT routes_campus_code_key UNIQUE (campus_id, code)
);

CREATE TABLE IF NOT EXISTS v1.stops (
  id VARCHAR(24) PRIMARY KEY,
  route_id VARCHAR(24) NOT NULL REFERENCES v1.routes(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  stop_order INTEGER NOT NULL,
  CONSTRAINT stops_route_order_key UNIQUE (route_id, stop_order)
);

CREATE TABLE IF NOT EXISTS v1.buses (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL REFERENCES v1.campuses(id),
  number VARCHAR(32) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 1 AND capacity <= 200),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'OFFLINE')),
  driver_id VARCHAR(24),
  route_id VARCHAR(24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT buses_campus_number_key UNIQUE (campus_id, number)
);

CREATE TABLE IF NOT EXISTS v1.trips (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL,
  bus_id VARCHAR(24) NOT NULL,
  driver_id VARCHAR(24) NOT NULL,
  route_id VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  mode VARCHAR(16) NOT NULL DEFAULT 'REAL' CHECK (mode IN ('REAL', 'SIMULATED')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_bus_key VARCHAR(24),
  active_driver_key VARCHAR(24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v1.vehicle_locations (
  bus_id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL,
  trip_id VARCHAR(24) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  speed_source VARCHAR(16) NOT NULL CHECK (speed_source IN ('device', 'derived', 'unavailable')),
  heading_deg DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  mode VARCHAR(16) NOT NULL CHECK (mode IN ('REAL', 'SIMULATED'))
);

CREATE TABLE IF NOT EXISTS v1.telemetry (
  campus_id VARCHAR(24) NOT NULL,
  trip_id VARCHAR(24) NOT NULL,
  bus_id VARCHAR(24) NOT NULL,
  driver_id VARCHAR(24) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  speed_source VARCHAR(16) NOT NULL CHECK (speed_source IN ('device', 'derived', 'unavailable')),
  heading_deg DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  live_eligible BOOLEAN NOT NULL,
  late_sync BOOLEAN NOT NULL,
  mode VARCHAR(16) NOT NULL CHECK (mode IN ('REAL', 'SIMULATED')),
  CONSTRAINT telemetry_trip_event_key UNIQUE (trip_id, event_id)
);

CREATE TABLE IF NOT EXISTS v1.schedules (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL,
  route_id VARCHAR(24) NOT NULL,
  bus_id VARCHAR(24) NOT NULL,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('TO_CAMPUS', 'FROM_CAMPUS')),
  days_of_week INTEGER[] NOT NULL,
  depart_time VARCHAR(5) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v1.notifications (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('ANNOUNCEMENT', 'DELAY', 'ROUTE_CHANGE', 'EMERGENCY')),
  priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
  title VARCHAR(160) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  route_id VARCHAR(24),
  created_by VARCHAR(24) NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v1.emergency_alerts (
  id VARCHAR(24) PRIMARY KEY,
  campus_id VARCHAR(24) NOT NULL,
  bus_id VARCHAR(24) NOT NULL,
  trip_id VARCHAR(24),
  raised_by VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  message VARCHAR(1000),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  acknowledged_by VARCHAR(24),
  acknowledged_at TIMESTAMPTZ,
  resolved_by VARCHAR(24),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS buses_driver_unique ON v1.buses (driver_id) WHERE driver_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trips_active_bus_key ON v1.trips (active_bus_key) WHERE active_bus_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trips_active_driver_key ON v1.trips (active_driver_key) WHERE active_driver_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v1_users_campus ON v1.users (campus_id);
CREATE INDEX IF NOT EXISTS idx_v1_users_campus_role_status ON v1.users (campus_id, role, status);
CREATE INDEX IF NOT EXISTS idx_v1_refresh_family ON v1.refresh_tokens (family_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_v1_refresh_user ON v1.refresh_tokens (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_v1_refresh_expires ON v1.refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_v1_buses_campus ON v1.buses (campus_id);
CREATE INDEX IF NOT EXISTS idx_v1_buses_campus_route ON v1.buses (campus_id, route_id);
CREATE INDEX IF NOT EXISTS idx_v1_routes_campus ON v1.routes (campus_id);
CREATE INDEX IF NOT EXISTS idx_v1_stops_route ON v1.stops (route_id);
CREATE INDEX IF NOT EXISTS idx_v1_trips_campus_started ON v1.trips (campus_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_v1_trips_driver ON v1.trips (driver_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_v1_trips_bus ON v1.trips (bus_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_v1_live_campus ON v1.vehicle_locations (campus_id);
CREATE INDEX IF NOT EXISTS idx_v1_telemetry_trip_captured ON v1.telemetry (trip_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_v1_telemetry_bus ON v1.telemetry (bus_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_v1_telemetry_received ON v1.telemetry (received_at);
CREATE INDEX IF NOT EXISTS idx_v1_schedules_campus ON v1.schedules (campus_id, route_id, depart_time);
CREATE INDEX IF NOT EXISTS idx_v1_schedules_bus ON v1.schedules (campus_id, bus_id);
CREATE INDEX IF NOT EXISTS idx_v1_notif_campus ON v1.notifications (campus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v1_alerts_campus ON v1.emergency_alerts (campus_id, status, created_at DESC);
