import { describe, expect, it } from 'vitest';
import { getNavItems } from '../src/components/layout/navConfig';

describe('dashboard navigation', () => {
  it('lists student items in the required order', () => {
    expect(getNavItems('STUDENT').map((item) => item.label)).toEqual([
      'Dashboard',
      'Live Buses',
      'Routes & Stops',
      'Schedules',
      'Notifications',
      'Complaints',
      'Profile',
    ]);
  });

  it('lists driver items for trip control, history, and profile', () => {
    expect(getNavItems('DRIVER').map((item) => item.label)).toEqual([
      'Driver Terminal',
      'My Route',
      'Trip History',
      'Notifications',
      'Vehicle & Duty',
    ]);
  });

  it('lists admin fleet, CRUD, assignment, analytics, and complaint items', () => {
    expect(getNavItems('ADMIN').map((item) => item.label)).toEqual([
      'Dashboard',
      'Live Fleet Map',
      'Bus Fleet',
      'Routes & Stops',
      'Schedules',
      'Drivers & Students',
      'Assignments',
      'Alerts',
      'Analytics',
      'Complaints',
      'Settings',
    ]);
  });
});
