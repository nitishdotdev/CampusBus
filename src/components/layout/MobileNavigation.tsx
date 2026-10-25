import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import {
  LayoutDashboard,
  Navigation,
  Route as RouteIcon,
  Bell,
  Bus,
  History,
  ShieldAlert,
  Users,
  Calendar,
  MessageSquare,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const MobileNavigation: React.FC = () => {
  const { role, unreadCount, activeEmergencyCount } = useApp();

  const studentItems: NavItem[] = [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/live', label: 'Live Buses', icon: Navigation },
    { to: '/student/routes', label: 'Routes', icon: RouteIcon },
    { to: '/student/schedules', label: 'Schedules', icon: Calendar },
    { to: '/student/notifications', label: 'Notices', icon: Bell, badge: unreadCount },
    { to: '/student/complaints', label: 'Complaints', icon: MessageSquare },
  ];

  const driverItems: NavItem[] = [
    { to: '/driver', label: 'Current Trip', icon: Navigation },
    { to: '/driver/route', label: 'My Route', icon: RouteIcon },
    { to: '/driver/history', label: 'History', icon: History },
    { to: '/driver/notifications', label: 'Notices', icon: Bell, badge: unreadCount },
    { to: '/driver/profile', label: 'Profile', icon: Bus },
  ];

  const adminItems: NavItem[] = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/fleet', label: 'Fleet Map', icon: Navigation },
    { to: '/admin/buses', label: 'Buses', icon: Bus },
    { to: '/admin/assignments', label: 'Assign', icon: RouteIcon },
    { to: '/admin/routes', label: 'Routes', icon: RouteIcon },
    { to: '/admin/alerts', label: 'Alerts', icon: ShieldAlert, badge: activeEmergencyCount },
    { to: '/admin/complaints', label: 'Complaints', icon: MessageSquare },
  ];

  const items = role === 'ADMIN' ? adminItems : role === 'DRIVER' ? driverItems : studentItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-2 py-1 flex items-center justify-around gap-1 overflow-x-auto pb-safe">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/student' || item.to === '/admin' || item.to === '/driver'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center shrink-0 min-w-[56px] min-h-[46px] py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors relative cursor-pointer ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            <div className="relative">
              <Icon className="w-5 h-5 mb-0.5" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
