export const LIVE_MAX_AGE_MS = 20_000;
export const OFFLINE_AFTER_MS = 120_000;

export function trackingAge(now: number, capturedAt: number, receivedAt: number): number {
  return Math.max(0, now - Math.min(capturedAt, Number.isFinite(receivedAt) ? receivedAt : capturedAt));
}

export function activeTrackingFreshness(ageMs: number): 'LIVE' | 'STALE' | 'DRIVER_OFFLINE' {
  if (ageMs <= LIVE_MAX_AGE_MS) return 'LIVE';
  if (ageMs <= OFFLINE_AFTER_MS) return 'STALE';
  return 'DRIVER_OFFLINE';
}
