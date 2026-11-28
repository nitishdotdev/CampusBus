/**
 * Pure Retry-After parsing, kept free of runtime imports so it can be unit-tested.
 */
/** Parses a Retry-After header given as delta-seconds or an HTTP date. Returns undefined when absent or invalid. */
export function parseRetryAfterMs(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}
