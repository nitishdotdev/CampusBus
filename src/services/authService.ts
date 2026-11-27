import type { User } from '../types';
import { getMeV1, logoutV1, type V1SessionUser } from './v1/auth';
import { ApiV1Error, refreshV1Session, v1Client, v1Token } from './v1/client';
import { socketV1 } from './v1/socket';

export type SessionRestoration = 'restored' | 'signed-out' | 'retry';

class AuthService {
  private currentUser: User | null = null;
  private listeners = new Set<(user: User | null) => void>();
  private restoration: Promise<SessionRestoration> | undefined;

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.currentUser && v1Token.getAccess());
  }

  public subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentUser);
    return () => this.listeners.delete(listener);
  }

  public restore(): Promise<SessionRestoration> {
    this.restoration ??= this.restoreSession().finally(() => { this.restoration = undefined; });
    return this.restoration;
  }

  private async restoreSession(): Promise<SessionRestoration> {
    if (this.currentUser) return 'restored';
    if (!v1Token.getRefresh()) return 'signed-out';
    if (!v1Token.getAccess() && !await refreshV1Session()) return v1Token.getRefresh() ? 'retry' : 'signed-out';

    const access = v1Token.getAccess();
    try {
      const user = await getMeV1();
      if (this.currentUser) return 'restored';
      if (!v1Token.getAccess()) return 'signed-out';
      if (user.status === 'ACTIVE') {
        this.setV1Session(user);
        return 'restored';
      }
    } catch (error) {
      if (this.currentUser) return 'restored';
      if (!(error instanceof ApiV1Error && error.status === 403)) return v1Token.getRefresh() ? 'retry' : 'signed-out';
    }
    if (v1Token.getAccess() === access) v1Token.clear();
    return 'signed-out';
  }

  public setV1Session(user: V1SessionUser): void {
    this.currentUser = {
      id: user.userId,
      collegeId: user.campusId,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    this.notifyListeners();
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      await v1Client.post('/api/v1/auth/change-password', { currentPassword, newPassword });
      // The old refresh token is revoked after a password change.
      v1Token.setRefresh(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof ApiV1Error && error.code === 'INCORRECT_CURRENT_PASSWORD'
        ? 'The current password is incorrect.' : 'Could not change your password. Check both passwords and try again.' };
    }
  }

  public logout(): void {
    void logoutV1();
    this.currentUser = null;
    socketV1.disconnect();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.currentUser));
  }
}

export const authService = new AuthService();
