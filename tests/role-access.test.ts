import { describe, expect, it } from 'vitest';
import {
  ROLE_REDIRECT,
  canSelfRegister,
  parseIntendedRole,
  roleLabel,
} from '../src/pages/auth/roleAccess';

describe('role access helpers', () => {
  it('parses role query values without trusting unknown input', () => {
    expect(parseIntendedRole('student')).toBe('STUDENT');
    expect(parseIntendedRole('DRIVER')).toBe('DRIVER');
    expect(parseIntendedRole('admin')).toBe('ADMIN');
    expect(parseIntendedRole('superadmin')).toBeNull();
    expect(parseIntendedRole(null)).toBeNull();
  });

  it('allows only student and driver self-registration', () => {
    expect(canSelfRegister('STUDENT')).toBe(true);
    expect(canSelfRegister('DRIVER')).toBe(true);
    expect(canSelfRegister('ADMIN')).toBe(false);
    expect(canSelfRegister(null)).toBe(false);
  });

  it('maps authenticated roles to dashboards', () => {
    expect(ROLE_REDIRECT.STUDENT).toBe('/student');
    expect(ROLE_REDIRECT.DRIVER).toBe('/driver');
    expect(ROLE_REDIRECT.ADMIN).toBe('/admin');
    expect(roleLabel('ADMIN')).toBe('Admin');
  });
});
