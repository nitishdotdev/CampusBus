import type { User } from '../types';
import { getMeV1, logoutV1, type V1SessionUser } from './v1/auth';
import { refreshV1Session, v1Token } from './v1/client';
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

  public async changePassword(_currentPassword: string, _newPassword: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Password changes are not available on this API. Use password reset from sign-in.' };
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
