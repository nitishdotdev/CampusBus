import { User, UserRole } from '../types';
import { apiClient, setStoredToken, getStoredToken } from './apiClient';
import { socketService } from './socketService';

const AUTH_STORAGE_KEY = 'smart_campus_bus_auth_user';

class AuthService {
  private currentUser: User | null = null;
  private listeners: ((user: User | null) => void)[] = [];

  constructor() {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch {
        this.currentUser = null;
      }
    }

    // If user has token, verify profile with backend asynchronously
    if (getStoredToken()) {
      this.validateSession();
    }
    // No longer auto-login as demo user
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return !!this.currentUser && !!getStoredToken();
  }

  public subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await apiClient.post<{ token: string; user: User }>('/api/auth/login', {
        email,
        password,
      });

      setStoredToken(res.token);
      this.currentUser = res.user;
      this.saveSession();
      this.notifyListeners();

      // Connect socket for user's college
      socketService.connect(res.user.collegeId);

      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed. Please check your credentials.' };
    }
  }

  public async register(data: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    collegeId: string;
    studentId?: string;
    cdlNumber?: string;
    phone?: string;
  }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await apiClient.post<{ token: string; user: User }>('/api/auth/register', data);

      setStoredToken(res.token);
      this.currentUser = res.user;
      this.saveSession();
      this.notifyListeners();

      socketService.connect(res.user.collegeId);

      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration failed.' };
    }
  }

  /**
   * Bridge: accept a v1 SessionUser and populate the existing AppContext-compatible
   * auth state without storing a legacy JWT (v1 tokens live in the v1 client module).
   */
  public setV1Session(v1User: { userId: string; campusId: string; name: string; email: string; role: string }): void {
    const syntheticUser: User = {
      id: v1User.userId,
      collegeId: v1User.campusId,
      name: v1User.name,
      email: v1User.email,
      role: v1User.role as UserRole,
    };
    // Store WITHOUT a token — v1 client manages its own access token in memory.
    // isAuthenticated() checks getStoredToken(), so we store a sentinel.
    setStoredToken('v1');
    this.currentUser = syntheticUser;
    this.saveSession();
    this.notifyListeners();
  }

  public logout(): void {
    setStoredToken(null);
    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    socketService.disconnect();
    this.notifyListeners();
  }

  private async validateSession(): Promise<void> {
    try {
      const res = await apiClient.get<{ user: User }>('/api/auth/me');
      if (res.user) {
        this.currentUser = res.user;
        this.saveSession();
        this.notifyListeners();
        socketService.connect(res.user.collegeId);
      }
    } catch {
      // Token invalid or expired, clear session
      this.logout();
    }
  }

  private saveSession(): void {
    if (this.currentUser) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l(this.currentUser));
  }
}

export const authService = new AuthService();
