import { v1Client, v1Token, ApiV1Error } from './client';

export type V1Role = 'STUDENT' | 'DRIVER' | 'ADMIN';
export type V1Status = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export interface V1Campus {
  id: string; name: string; shortCode: string; city: string;
  lat: number; lng: number; zoom: number; timezone: string;
}

export interface V1SessionUser {
  userId: string; campusId: string; role: V1Role;
  name: string; email: string; status: V1Status;
}

export interface V1LoginResult {
  user: V1SessionUser;
  accessToken: string;
  expiresIn: number;
}

export function formatCampusFetchError(_err: unknown): string {
  return 'Cannot reach the campus directory. Check your connection and try again.';
}

// ── Campus list (public) ──────────────────────────────────────────────────────
export async function listCampuses(): Promise<V1Campus[]> {
  return v1Client.get<V1Campus[]>('/api/v1/campuses');
}

// ── Auth ───────────────────────────────────────────────────────────────────────
interface LoginResponse {
  tokens: { accessToken: string; expiresIn: number };
  refreshToken: string;
  user: V1SessionUser;
}

export async function loginV1(
  campusId: string,
  email: string,
  password: string,
): Promise<{ ok: true; result: V1LoginResult } | { ok: false; error: string }> {
  try {
    const data = await v1Client.postPublic<LoginResponse>('/api/v1/auth/login', {
      campusId, email, password,
    });
    v1Token.setAccess(data.tokens.accessToken);
    v1Token.setRefresh(data.refreshToken);
    return { ok: true, result: { user: data.user, accessToken: data.tokens.accessToken, expiresIn: data.tokens.expiresIn } };
  } catch (err) {
    const msg = err instanceof ApiV1Error
      ? humanizeError(err.code ?? err.message)
      : 'Login failed. Check your connection.';
    return { ok: false, error: msg };
  }
}

export async function registerV1(params: {
  campusId: string; email: string; password: string;
  name: string; role: 'STUDENT' | 'DRIVER';
}): Promise<{ ok: true; user: V1SessionUser } | { ok: false; error: string }> {
  try {
    const data = await v1Client.postPublic<{ user: V1SessionUser }>('/api/v1/auth/register', params);
    return { ok: true, user: data.user };
  } catch (err) {
    const msg = err instanceof ApiV1Error
      ? humanizeError(err.code ?? err.message)
      : 'Registration failed.';
    return { ok: false, error: msg };
  }
}

export async function logoutV1(): Promise<void> {
  const rt = v1Token.getRefresh();
  v1Token.clear();
  try {
    if (rt) await v1Client.postPublic('/api/v1/auth/logout', { refreshToken: rt });
  } catch { /* best-effort */ }
}

export async function getMeV1(): Promise<V1SessionUser | null> {
  try {
    return await v1Client.get<V1SessionUser>('/api/v1/users/me');
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function humanizeError(code: string): string {
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: 'Incorrect email or password.',
    ACCOUNT_PENDING_APPROVAL: 'Your account is pending admin approval.',
    ACCOUNT_DISABLED: 'This account has been disabled.',
    ACCOUNT_REJECTED: 'This account application was rejected.',
    EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',
    EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
    LOGIN_RATE_LIMITED: 'Too many login attempts. Please wait and try again.',
    INVALID_REQUEST: 'Please check your input and try again.',
  };
  return map[code] ?? code;
}
