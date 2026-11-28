import { describe, expect, it } from 'vitest';
import { parseRetryAfterMs } from '../src/services/v1/retryAfter';

describe('parseRetryAfterMs', () => {
  const now = Date.UTC(2026, 10, 28, 10, 0, 0);

  it('reads delta-seconds as milliseconds', () => {
    expect(parseRetryAfterMs('30', now)).toBe(30_000);
    expect(parseRetryAfterMs(' 5 ', now)).toBe(5_000);
  });

  it('reads an HTTP date relative to the given time, never returning a negative wait', () => {
    expect(parseRetryAfterMs(new Date(now + 120_000).toUTCString(), now)).toBe(120_000);
    expect(parseRetryAfterMs(new Date(now - 60_000).toUTCString(), now)).toBe(0);
  });

  it('returns undefined when the header is absent or unparseable', () => {
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
    expect(parseRetryAfterMs('', now)).toBeUndefined();
    expect(parseRetryAfterMs('soon', now)).toBeUndefined();
  });
});
