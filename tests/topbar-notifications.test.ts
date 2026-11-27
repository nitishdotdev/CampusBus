/** @vitest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { TopBar } from '../src/components/layout/TopBar';

const state = vi.hoisted(() => ({ unreadCount: 0 }));
vi.mock('../src/store/AppContext', () => ({
  useApp: () => ({
    role: 'STUDENT',
    currentCollege: { name: 'QA Campus', shortCode: 'QA' },
    locationState: { networkStatus: 'ONLINE' },
    unreadCount: state.unreadCount,
  }),
}));

it.each([
  { unreadCount: 0, label: 'Notifications' },
  { unreadCount: 12, label: 'Notifications, 12 unread' },
])(
  'gives the notification link an accessible name for $unreadCount unread notices',
  ({ unreadCount, label }) => {
    state.unreadCount = unreadCount;
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(TopBar)));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('a[href="/student/notifications"]');
    expect(link?.getAttribute('aria-label')).toBe(label);
    if (unreadCount) expect(link?.textContent).toBe(String(unreadCount));
  },
);
