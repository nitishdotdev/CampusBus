/** Fixed-window event counter, per key. Single-process only; use a shared store when running several instances. */
export class EventRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}

  /** Returns true if `n` more events fit in the current window (and records them). */
  tryConsume(key: string, n = 1): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      if (n > this.limit) return false;
      this.windows.set(key, { start: t, count: n });
      return true;
    }
    if (w.count + n > this.limit) return false;
    w.count += n;
    return true;
  }
}
