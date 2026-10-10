-- CampusMove PostgreSQL Migration
-- Add Schedules and Complaints tables for production

-- 10. SCHEDULES (Bus departure schedule planning)
CREATE TABLE IF NOT EXISTS schedules (
    id VARCHAR(64) PRIMARY KEY,
    college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    bus_id VARCHAR(64) NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    route_id VARCHAR(64) NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    departure_time TIME NOT NULL,
    arrival_time TIME,
    operating_days JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedules_college ON schedules(college_id);
CREATE INDEX IF NOT EXISTS idx_schedules_bus ON schedules(bus_id);
CREATE INDEX IF NOT EXISTS idx_schedules_route ON schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_schedules_day ON schedules USING GIN (operating_days);

-- 11. COMPLAINTS (Student feedback and issues)
CREATE TABLE IF NOT EXISTS complaints (
    id VARCHAR(64) PRIMARY KEY,
    college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id VARCHAR(64) REFERENCES trips(id) ON DELETE SET NULL,
    bus_id VARCHAR(64) REFERENCES buses(id) ON DELETE SET NULL,
    route_id VARCHAR(64) REFERENCES routes(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'OTHER' CHECK (category IN ('DRIVER_BEHAVIOR', 'VEHICLE_CONDITION', 'SCHEDULE_ISSUE', 'CLEANLINESS', 'SAFETY', 'OTHER')),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
    admin_response TEXT,
    admin_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_college ON complaints(college_id);
CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
