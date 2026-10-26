import type { UserRole } from '../../types';

export const ROLE_REDIRECT: Record<UserRole, string> = {
  STUDENT: '/student',
  DRIVER: '/driver',
  ADMIN: '/admin',
};

export const PUBLIC_REGISTER_ROLES: ReadonlyArray<Extract<UserRole, 'STUDENT'>> = ['STUDENT'];

export function parseIntendedRole(value: string | null): UserRole | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'STUDENT' || normalized === 'DRIVER' || normalized === 'ADMIN') {
    return normalized;
  }
  return null;
}

export function roleLabel(role: UserRole): string {
  if (role === 'STUDENT') return 'Student';
  if (role === 'DRIVER') return 'Driver';
  return 'Admin';
}

export function canSelfRegister(role: UserRole | null): role is 'STUDENT' {
  return role === 'STUDENT';
}
