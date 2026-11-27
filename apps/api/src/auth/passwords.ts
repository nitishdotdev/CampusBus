import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';

// OWASP 2023 recommended parameters for production.
// In tests (NODE_ENV=test) we use much lower cost so hashing stays fast.
const isTest = process.env.NODE_ENV === 'test';
const OPTS: argon2.HashOptions = isTest
  ? { type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1 }
  : { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

// Hash of a public placeholder. Unknown accounts still perform a full Argon2id check.
export const UNKNOWN_ACCOUNT_HASH = '$argon2id$v=19$m=65536,p=4,t=3$mjTqNqMvUnUovwQ8s0gLbQ$KCwqmjoJRN+G4hrSXuBGJXmOEUEFkmiBQH1jvwcGufc';

export async function hashPassword(password: string): Promise<string> { return argon2.hash(password, OPTS); }

export type VerifyResult =
  | { ok: true; needsRehash: false }
  | { ok: true; needsRehash: true; newHash: string }
  | { ok: false };

export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith('$argon2')) {
    let ok = false;
    try {
      ok = await argon2.verify(stored, password);
    } catch {
      return { ok: false };
    }
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
}
