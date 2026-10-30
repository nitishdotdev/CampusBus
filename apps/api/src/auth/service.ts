import crypto from 'crypto';
import { z } from 'zod';
import { badRequest, DomainError, forbidden, notFound, tooMany } from '../domain/errors';
import type { EmailSender, EmailTokenRepository, Principal, RefreshTokenRepository, Role, SessionInfo, UserRepository, UserStatus } from '../domain/types';
import { hashPassword, verifyPassword } from './passwords';
import { generateOTP, generateRefreshToken, hashRefreshToken, hashToken, requireAccessSecret, requireRefreshSecret, signAccessToken, type VerifiedPrincipal, verifyAccessToken } from './tokens';

export interface AuthConfig {
  accessTtlSeconds: number;
  refreshTtlDays: number;
  emailVerificationRequired: boolean;
  emailTokenTtlMinutes: number;
  resetTokenTtlMinutes: number;
  rateLimitLoginAttempts: number;
  rateLimitWindowMs: number;
  env: NodeJS.ProcessEnv;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  accessTtlSeconds: 900,
  refreshTtlDays: 30,
  emailVerificationRequired: false, // can be enabled via env EMAIL_VERIFICATION_REQUIRED=true
  emailTokenTtlMinutes: 60,
  resetTokenTtlMinutes: 20,
  rateLimitLoginAttempts: 10,
  rateLimitWindowMs: 15 * 60_000,
  env: process.env,
};

// ─── Validation schemas ───────────────────────────────────────────────────────
const passwordSchema = z.string().min(8).max(72).regex(/[A-Za-z]/, 'must contain a letter').regex(/[0-9!@#$%^&*]/, 'must contain a number or symbol');
const nameSchema = z.string().min(1).max(120).trim();
const emailSchema = z.string().email().toLowerCase().max(254);
const ALLOWED_SELF_REGISTER_ROLES: Role[] = ['STUDENT', 'DRIVER'];

export const registerSchema = z.object({
  campusId: z.string().regex(/^[a-f0-9]{24}$/i),
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  role: z.enum(['STUDENT', 'DRIVER'] as const),
}).strict();

export const loginSchema = z.object({
  campusId: z.string().regex(/^[a-f0-9]{24}$/i),
  email: emailSchema,
  password: z.string().min(1).max(256),
}).strict();

export const createDriverSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: z.string().max(32).optional(),
}).strict();

// Simple in-process per-email login rate limiter
class LoginLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}
  check(key: string): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) { this.windows.set(key, { start: t, count: 1 }); return true; }
    if (w.count >= this.limit) return false;
    w.count += 1; return true;
  }
}

export interface AuthDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  emailTokens: EmailTokenRepository;
  email: EmailSender;
  config: AuthConfig;
  now?: () => Date;
}

export class AuthService {
  private now: () => Date;
  private accessSecret: string;
  private refreshSecret: string;
  private limiter: LoginLimiter;

  constructor(private d: AuthDeps) {
    this.now = d.now ?? (() => new Date());
    this.accessSecret = requireAccessSecret(d.config.env);
    this.refreshSecret = requireRefreshSecret(d.config.env);
    this.limiter = new LoginLimiter(d.config.rateLimitLoginAttempts, d.config.rateLimitWindowMs, () => this.now().getTime());
  }

  // ─── Admin-provisioned driver ──────────────────────────────────────────────
  async createDriver(principal: Principal, body: unknown): Promise<SessionInfo> {
    if (principal.role !== 'ADMIN') throw forbidden();
    const parsed = createDriverSchema.safeParse(body);
    if (!parsed.success) throw badRequest('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'validation');
    const { email, password, name, phone } = parsed.data;
    const hash = await hashPassword(password);
    const user = await this.d.users.create({
      campusId: principal.campusId, email, passwordHash: hash, name, role: 'DRIVER', status: 'ACTIVE', phone,
    });
    return toSession(user);
  }

  // ─── Register ──────────────────────────────────────────────────────────────
  async register(body: unknown): Promise<{ user: SessionInfo }> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) throw badRequest('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'validation');
    const { campusId, email, password, name, role } = parsed.data;
    const hash = await hashPassword(password);
    const initialStatus = role === 'DRIVER' ? 'PENDING' : 'ACTIVE'; // drivers need admin approval
    const user = await this.d.users.create({ campusId, email, passwordHash: hash, name, role, status: initialStatus });
    if (d_requireVerify(this.d.config)) {
      await this.sendVerification(user.campusId, user.id, user.email, user.name);
    }
    return { user: toSession(user) };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  async login(body: unknown): Promise<{ tokens: { accessToken: string; expiresIn: number }; refreshToken: string; user: SessionInfo }> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw badRequest('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'validation');
    const { campusId, email, password } = parsed.data;

    // Rate limit by (campusId, email) to prevent enumeration and brute-force.
    if (!this.limiter.check(`${campusId}:${email}`)) throw tooMany('LOGIN_RATE_LIMITED');

    // Constant-time: fetch the user first and only then verify (no timing difference for unknown emails).
    const user = await this.d.users.findByEmail(campusId, email);
    const dummyHash = await dummyArgon2Hash();
    const verify = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !verify.ok) throw new DomainError(401, 'INVALID_CREDENTIALS');

    if (user.status === 'DISABLED') throw forbidden('ACCOUNT_DISABLED');
    if (user.status === 'REJECTED') throw forbidden('ACCOUNT_REJECTED');
    if (user.status === 'PENDING') throw new DomainError(403, 'ACCOUNT_PENDING_APPROVAL');
    if (d_requireVerify(this.d.config) && !user.emailVerifiedAt) throw new DomainError(403, 'EMAIL_NOT_VERIFIED');

    // Opportunistic live migration of bcrypt hashes to Argon2id.
    if (verify.needsRehash) await this.d.users.updatePassword(campusId, user.id, verify.newHash);

    const { raw } = await this.issueRefreshToken(user.id, campusId);
    const accessToken = signAccessToken({ userId: user.id, campusId, role: user.role }, this.accessSecret, this.d.config.accessTtlSeconds);
    return { tokens: { accessToken, expiresIn: this.d.config.accessTtlSeconds }, refreshToken: raw, user: toSession(user) };
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────
  async refresh(rawToken: string): Promise<{ tokens: { accessToken: string; expiresIn: number }; refreshToken: string }> {
    const hash = hashRefreshToken(rawToken);
    const stored = await this.d.refreshTokens.find(hash);
    if (!stored) throw new DomainError(401, 'INVALID_REFRESH_TOKEN');
    if (stored.revokedAt) {
      // Reuse detected: revoke the whole family to neutralize any stolen token.
      await this.d.refreshTokens.revokeFamily(stored.familyId, this.now());
      throw new DomainError(401, 'REFRESH_TOKEN_REUSE');
    }
    if (stored.expiresAt < this.now()) throw new DomainError(401, 'REFRESH_TOKEN_EXPIRED');

    const user = await this.d.users.findById(stored.campusId, stored.userId);
    if (!user || user.status !== 'ACTIVE') { await this.d.refreshTokens.revokeFamily(stored.familyId, this.now()); throw forbidden('ACCOUNT_NOT_ACTIVE'); }

    // Rotate: revoke old token, issue a new one in the same family.
    await this.d.refreshTokens.revoke(stored.id, this.now());
    const { raw, id } = await this.issueRefreshToken(user.id, stored.campusId, stored.familyId, stored.id);
    void id; // used internally
    const accessToken = signAccessToken({ userId: user.id, campusId: stored.campusId, role: user.role }, this.accessSecret, this.d.config.accessTtlSeconds);
    return { tokens: { accessToken, expiresIn: this.d.config.accessTtlSeconds }, refreshToken: raw };
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  async logout(rawToken: string): Promise<void> {
    const hash = hashRefreshToken(rawToken);
    const stored = await this.d.refreshTokens.find(hash);
    if (stored && !stored.revokedAt) await this.d.refreshTokens.revoke(stored.id, this.now());
  }

  async logoutAll(principal: Principal): Promise<void> {
    await this.d.refreshTokens.revokeAll(principal.userId, this.now());
  }

  // ─── Email verification ────────────────────────────────────────────────────
  async sendVerification(campusId: string, userId: string, email: string, name: string): Promise<void> {
    const otp = generateOTP();
    const expiresAt = new Date(this.now().getTime() + this.d.config.emailTokenTtlMinutes * 60_000);
    await this.d.emailTokens.upsert({ userId, campusId, purpose: 'VERIFY_EMAIL', tokenHash: hashToken(otp), expiresAt });
    await this.d.email.sendVerification(email, name, otp);
  }

  async verifyEmail(campusId: string, userId: string, otp: string): Promise<void> {
    const rec = await this.d.emailTokens.find(hashToken(otp), 'VERIFY_EMAIL');
    if (!rec || rec.usedAt || rec.expiresAt < this.now()) throw new DomainError(400, 'INVALID_OR_EXPIRED_TOKEN');
    if (rec.userId !== userId || rec.campusId !== campusId) throw forbidden();
    await Promise.all([this.d.users.verifyEmail(campusId, userId, this.now()), this.d.emailTokens.markUsed(hashToken(otp), this.now())]);
  }

  // ─── Password reset ────────────────────────────────────────────────────────
  async requestPasswordReset(campusId: string, email: string): Promise<void> {
    // Always appears to succeed to prevent email enumeration.
    const user = await this.d.users.findByEmail(campusId, email.toLowerCase());
    if (!user || user.status === 'DISABLED') return;
    const token = generateOTP();
    const expiresAt = new Date(this.now().getTime() + this.d.config.resetTokenTtlMinutes * 60_000);
    await this.d.emailTokens.upsert({ userId: user.id, campusId, purpose: 'RESET_PASSWORD', tokenHash: hashToken(token), expiresAt });
    await this.d.email.sendPasswordReset(email, user.name, token);
  }

  async confirmPasswordReset(campusId: string, email: string, otp: string, newPassword: string): Promise<void> {
    const pwResult = z.object({ password: passwordSchema }).safeParse({ password: newPassword });
    if (!pwResult.success) throw badRequest('WEAK_PASSWORD', pwResult.error.issues[0]?.message);
    const rec = await this.d.emailTokens.find(hashToken(otp), 'RESET_PASSWORD');
    if (!rec || rec.usedAt || rec.expiresAt < this.now()) throw new DomainError(400, 'INVALID_OR_EXPIRED_TOKEN');
    const user = await this.d.users.findByEmail(campusId, email.toLowerCase());
    if (!user || user.id !== rec.userId) throw new DomainError(400, 'INVALID_OR_EXPIRED_TOKEN');
    const hash = await hashPassword(newPassword);
    await Promise.all([
      this.d.users.updatePassword(campusId, user.id, hash),
      this.d.emailTokens.markUsed(hashToken(otp), this.now()),
      this.d.refreshTokens.revokeAll(user.id, this.now()),
    ]);
  }

  // ─── Admin bootstrap ───────────────────────────────────────────────────────
  /**
   * Creates the first ADMIN account for a campus.  Fails if any ADMIN already exists.
   * Must be called from a trusted internal path (e.g. CLI script, not an HTTP route exposed to the public).
   */
  async bootstrapAdmin(campusId: string, email: string, password: string, name: string): Promise<SessionInfo> {
    const existing = await this.d.users.list(campusId, { role: 'ADMIN', pageSize: 1 });
    if (existing.total > 0) throw new DomainError(409, 'ADMIN_ALREADY_EXISTS');
    const hash = await hashPassword(password);
    const user = await this.d.users.create({ campusId, email: email.toLowerCase(), passwordHash: hash, name, role: 'ADMIN', status: 'ACTIVE' });
    return toSession(user);
  }

  // ─── Verify access token (used by middleware) ──────────────────────────────
  verifyAccessToken(token: string): VerifiedPrincipal | null {
    return verifyAccessToken(token, this.accessSecret);
  }

  // ─── Private ───────────────────────────────────────────────────────────────
  private async issueRefreshToken(userId: string, campusId: string, familyId?: string, previousId?: string): Promise<{ raw: string; id: string }> {
    const raw = generateRefreshToken();
    const hash = hashRefreshToken(raw);
    const family = familyId ?? crypto.randomUUID();
    const expiresAt = new Date(this.now().getTime() + this.d.config.refreshTtlDays * 86_400_000);
    const id = await this.d.refreshTokens.create({ userId, campusId, tokenHash: hash, familyId: family, expiresAt, previousId });
    return { raw, id };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toSession(u: { id: string; campusId: string; role: Role; name: string; email: string; status: UserStatus }): SessionInfo {
  return { userId: u.id, campusId: u.campusId, role: u.role, name: u.name, email: u.email, status: u.status };
}
function d_requireVerify(cfg: AuthConfig) { return cfg.emailVerificationRequired || cfg.env.EMAIL_VERIFICATION_REQUIRED === 'true'; }

let dummyHashPromise: Promise<string> | null = null;
function dummyArgon2Hash(): Promise<string> {
  dummyHashPromise ??= hashPassword('not-a-real-user');
  return dummyHashPromise;
}
