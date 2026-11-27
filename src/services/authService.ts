import type { User } from '../types';
import { getMeV1, logoutV1, type V1SessionUser } from './v1/auth';
import { ApiV1Error, refreshV1Session, v1Client, v1Token } from './v1/client';
import { socketV1 } from './v1/socket';

class AuthService {
  private currentUser: User | null = null;
  private listeners = new Set<(user: User | null) => void>();
  private restoration: Promise<void> | undefined;

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

  public restore(): Promise<void> {
    this.restoration ??= this.restoreSession();
    return this.restoration;
  }

  private async restoreSession(): Promise<void> {
    if (this.currentUser || !v1Token.getRefresh()) return;
    if (!await refreshV1Session()) return;
    const user = await getMeV1();
    if (user?.status === 'ACTIVE' && v1Token.getAccess() && !this.currentUser) {
      this.setV1Session(user);
    }
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
