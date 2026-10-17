// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require('argon2') as { hash(pw: string, o: object): Promise<string>; verify(h: string, pw: string): Promise<boolean>; needsRehash(h: string, o: object): boolean; argon2id: number };
import * as bcrypt from 'bcryptjs';

// OWASP 2023 recommended parameters for production.
// In tests (NODE_ENV=test) we use much lower cost so hashing stays fast.
const isTest = process.env.NODE_ENV === 'test';
const OPTS = isTest
  ? { type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1 }
  : { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

export async function hashPassword(password: string): Promise<string> { return argon2.hash(password, OPTS); }

// A valid, cost-matched dummy hash for login's timing-safe "verify something
// even when the user doesn't exist" path. It must actually run a real argon2
// verify (not throw on malformed input) so an unknown-email lookup takes the
// same time as a real one — otherwise the anti-enumeration timing protection
// is defeated by the early parse failure, independent of the ok/not-ok result.
// Computed once, lazily, at current OPTS (test vs. production cost).
let dummyHashPromise: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = argon2.hash('dummy-password-for-constant-time-login', OPTS);
  return dummyHashPromise;
}

export type VerifyResult =
  | { ok: true; needsRehash: false }
  | { ok: true; needsRehash: true; newHash: string }
  | { ok: false };

export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  // A malformed/corrupt hash (including the synthetic dummy hash login() verifies
  // against for unknown users, to keep timing constant) must fail verification,
  // not throw — argon2.verify() and bcrypt.compare() throw on bad input rather
  // than returning false, which previously surfaced as a 500 instead of a 401.
  try {
    if (stored.startsWith('$argon2')) {
      const ok = await argon2.verify(stored, password);
      if (!ok) return { ok: false };
      // In tests, needsRehash is expected (different params); skip it to avoid spurious DB writes.
      const needsRehash = !isTest && argon2.needsRehash(stored, OPTS);
      if (needsRehash) return { ok: true, needsRehash: true, newHash: await argon2.hash(password, OPTS) };
      return { ok: true, needsRehash: false };
    }
    if (stored.startsWith('$2') && stored.length >= 60) {
      const ok = await bcrypt.compare(password, stored);
      if (!ok) return { ok: false };
      return { ok: true, needsRehash: true, newHash: await argon2.hash(password, OPTS) };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
