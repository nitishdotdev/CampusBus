export interface TrackingConfig {
  maxEventsPerBatch: number;
  maxFutureSkewMs: number;      // capture time may be at most this far ahead of the server clock
  maxEventAgeMs: number;        // older events are rejected outright
  lateSyncWindowMs: number;     // after a trip ends, history-only sync is accepted for this long
  liveMaxAgeMs: number;         // only events received this soon after capture may move the live marker
  liveMaxAccuracyM: number;
  maxAccuracyM: number;
  maxSpeedMps: number;
  maxPlausibleSpeedMps: number; // implied speed between two accepted points
  minJumpMetersForCheck: number;
  rateLimitEvents: number;      // events per driver per window
  rateLimitWindowMs: number;
  retentionDays: number;        // telemetry history retention (purge job)
  simulationEnabled: boolean;
}

export const DEFAULT_TRACKING: TrackingConfig = {
  maxEventsPerBatch: 50,
  maxFutureSkewMs: 10_000,
  maxEventAgeMs: 24 * 3600_000,
  lateSyncWindowMs: 6 * 3600_000,
  liveMaxAgeMs: 30_000,
  liveMaxAccuracyM: 200,
  maxAccuracyM: 1000,
  maxSpeedMps: 70,
  maxPlausibleSpeedMps: 80,
  minJumpMetersForCheck: 100,
  rateLimitEvents: 120,
  rateLimitWindowMs: 60_000,
  retentionDays: 90,
  simulationEnabled: false,
};

/**
 * Simulation is a server-controlled capability. It can only be switched on outside production,
 * so a production process can never accept or create simulated trips.
 */
export function loadTrackingConfig(env: NodeJS.ProcessEnv = process.env): TrackingConfig {
  const wantsSimulation = env.SIMULATION_MODE === 'on';
  if (wantsSimulation && env.NODE_ENV === 'production') {
    throw new Error('FATAL: SIMULATION_MODE=on is not permitted when NODE_ENV=production.');
  }
  const num = (k: string, d: number) => {
    const v = env[k];
    if (v === undefined || v === '') return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${k}: ${v}`);
    return n;
  };
  return {
    ...DEFAULT_TRACKING,
    retentionDays: num('TELEMETRY_RETENTION_DAYS', DEFAULT_TRACKING.retentionDays),
    rateLimitEvents: num('TELEMETRY_RATE_LIMIT_EVENTS', DEFAULT_TRACKING.rateLimitEvents),
    simulationEnabled: wantsSimulation,
  };
}
