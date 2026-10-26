import type { UserRole } from '../../types';

export interface NavItemConfig {
  to: string;
  label: string;
  end?: boolean;
}

const STUDENT_NAV: NavItemConfig[] = [
  { to: '/student', label: 'Dashboard', end: true },
  { to: '/student/live', label: 'Live Buses' },
  { to: '/student/routes', label: 'Routes & Stops' },
  { to: '/student/schedules', label: 'Schedules' },
  { to: '/student/notifications', label: 'Notifications' },
  { to: '/student/complaints', label: 'Complaints' },
  { to: '/student/profile', label: 'Profile' },
];

const DRIVER_NAV: NavItemConfig[] = [
  { to: '/driver', label: 'Driver Terminal', end: true },
  { to: '/driver/history', label: 'Trip History' },
  { to: '/driver/profile', label: 'Vehicle & Duty' },
];

const ADMIN_NAV: NavItemConfig[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/fleet', label: 'Live Fleet Map' },
  { to: '/admin/buses', label: 'Bus Fleet' },
  { to: '/admin/routes', label: 'Routes & Stops' },
  { to: '/admin/schedules', label: 'Schedules' },
  { to: '/admin/directory', label: 'Drivers & Students' },
  { to: '/admin/alerts', label: 'Alerts' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/settings', label: 'Settings' },
];

export function getNavItems(role: UserRole): NavItemConfig[] {
  if (role === 'ADMIN') return ADMIN_NAV;
  if (role === 'DRIVER') return DRIVER_NAV;
  return STUDENT_NAV;
}
