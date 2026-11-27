import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { workspaceLinks } from './Sidebar';

export const MobileNavigation: React.FC = () => {
  const { role, unreadCount, activeEmergencyCount } = useApp();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const links = workspaceLinks(role, unreadCount, activeEmergencyCount);
  const primary = links.slice(0, 3);
  const secondary = links.slice(3);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav aria-label="Mobile workspace" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-safe md:hidden"
      onKeyDown={event => {
        if (open && event.key === 'Escape') {
          setOpen(false);
          menuButton.current?.focus();
        }
      }}>
      {open && (
        <div id="mobile-workspace-links" className="grid max-h-[55vh] grid-cols-2 gap-1 overflow-y-auto border-b border-slate-200 p-2">
          {secondary.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700'}`}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {label}{badge ? <span className="rounded-full bg-rose-700 px-1.5 text-white">{badge}</span> : null}
            </NavLink>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 p-1">
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end onClick={() => setOpen(false)}
            className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-center text-[10px] font-semibold ${isActive ? 'text-blue-800' : 'text-slate-700'}`}>
            <Icon aria-hidden="true" className="h-5 w-5" />{label}
          </NavLink>
        ))}
        <button type="button" ref={menuButton} aria-expanded={open} aria-controls={open ? 'mobile-workspace-links' : undefined} onClick={() => setOpen(value => !value)}
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold text-slate-700">
          {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          {open ? 'Close menu' : 'More'}
        </button>
      </div>
    </nav>
  );
};
