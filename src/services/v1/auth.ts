import { v1Client, v1Token, ApiV1Error } from './client';

export type V1Role = 'STUDENT' | 'DRIVER' | 'ADMIN';
export type V1Status = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export interface V1Campus {
  id: string; name: string; shortCode: string; city: string;
  lat: number; lng: number; zoom: number; timezone: string;
  dispatchPhone?: string | null; gpsIntervalSeconds?: number;
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

export function formatCampusFetchError(err: unknown): string {
  if (err instanceof ApiV1Error) {
    if (err.status === 404) {
      return 'Campus directory route not found. The app is calling a missing V1 API path.';
    }
    if (err.status === 0 || err.status >= 500) {
      return 'Cannot reach the campus directory. Check your connection and try again.';
    }
    return `Cannot load campuses (${err.status}). Check the API and try again.`;
  }
  return 'Cannot reach the campus directory. Check your connection or CORS configuration and try again.';
}

// ── Campus list (public) ──────────────────────────────────────────────────────
export function updateCampusSettings(values: { name: string; dispatchPhone: string | null; gpsIntervalSeconds: number }) {
  return v1Client.patch<V1Campus>('/api/v1/campuses/settings', values);
}

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
    return { ok: false, error: formatAuthError(err, 'login') };
  }
}

export async function registerV1(params: {
  campusId: string; email: string; password: string;
  name: string; role: 'STUDENT';
}): Promise<{ ok: true; user: V1SessionUser } | { ok: false; error: string }> {
  try {
    const data = await v1Client.postPublic<{ user: V1SessionUser }>('/api/v1/auth/register', params);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: formatAuthError(err, 'register') };
  }
}

export async function logoutV1(): Promise<void> {
  const rt = v1Token.getRefresh();
  v1Token.clear();
  try {
    if (rt) await v1Client.postPublic('/api/v1/auth/logout', { refreshToken: rt });
  } catch { /* best-effort */ }
}

export function requestPasswordResetV1(campusId: string, email: string) {
  return v1Client.postPublic('/api/v1/auth/request-password-reset', { campusId, email });
}

export function confirmPasswordResetV1(campusId: string, email: string, otp: string, newPassword: string) {
  return v1Client.postPublic('/api/v1/auth/confirm-password-reset', { campusId, email, otp, newPassword });
}

export function formatPasswordResetError(error: unknown): string {
  if (!(error instanceof ApiV1Error)) return 'Check your connection and try again.';
  switch (error.code) {
    case 'PASSWORD_RESET_UNAVAILABLE': return 'Email recovery is unavailable. Contact your campus administrator.';
    case 'PASSWORD_RESET_RATE_LIMITED': return 'Too many attempts. Wait and try again.';
    case 'INVALID_OR_EXPIRED_TOKEN': return 'This code is invalid or expired. Check the code or request a new one.';
    case 'WEAK_PASSWORD': return 'Use 8 to 72 characters with a letter and a number or symbol.';
    case 'INVALID_REQUEST': return 'Check the entered details and try again.';
    default: return 'Password recovery failed. Try again or contact your campus administrator.';
  }
}

export async function getMeV1(): Promise<V1SessionUser> {
  const { id, ...user } = await v1Client.get<Omit<V1SessionUser, 'userId'> & { id: string }>('/api/v1/users/me');
  return { ...user, userId: id };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatAuthError(err: unknown, action: 'login' | 'register'): string {
  if (err instanceof ApiV1Error) {
    if (err.status === 404) {
      return 'Authentication route not found. The app is not talking to the V1 API.';
    }
    return humanizeError(err.code ?? err.message);
  }
  return action === 'login'
    ? 'Login failed. Check your connection or CORS configuration.'
    : 'Registration failed. Check your connection or CORS configuration.';
}

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
