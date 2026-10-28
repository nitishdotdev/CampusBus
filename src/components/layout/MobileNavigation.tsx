import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { getNavItems } from './navConfig';
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
  User,
  BarChart3,
  Settings,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/student': LayoutDashboard,
  '/student/live': Navigation,
  '/student/routes': RouteIcon,
  '/student/schedules': Calendar,
  '/student/notifications': Bell,
  '/student/complaints': MessageSquare,
  '/student/profile': User,
  '/driver': Navigation,
  '/driver/history': History,
  '/driver/profile': Bus,
  '/admin': LayoutDashboard,
  '/admin/fleet': Navigation,
  '/admin/buses': Bus,
  '/admin/routes': RouteIcon,
  '/admin/schedules': Calendar,
  '/admin/directory': Users,
  '/admin/assignments': RouteIcon,
  '/admin/alerts': ShieldAlert,
  '/driver/route': RouteIcon,
  '/driver/notifications': Bell,
  '/admin/analytics': BarChart3,
  '/admin/complaints': MessageSquare,
  '/admin/settings': Settings,
};

export const MobileNavigation: React.FC = () => {
  const { role, unreadCount, activeEmergencyCount } = useApp();
  const items = getNavItems(role).filter((item) => {
    if (role === 'STUDENT') {
      return ['/student', '/student/live', '/student/routes', '/student/notifications', '/student/profile'].includes(item.to);
    }
    if (role === 'ADMIN') {
      return ['/admin', '/admin/fleet', '/admin/buses', '/admin/alerts', '/admin/directory'].includes(item.to);
    }
    return true;
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-2 py-1 flex items-center justify-around gap-1 overflow-x-auto pb-safe">
      {items.map((item) => {
        const Icon = ICONS[item.to] || LayoutDashboard;
        const badge =
          item.to === '/student/notifications' ? unreadCount :
          item.to === '/admin/alerts' ? activeEmergencyCount :
          undefined;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center shrink-0 min-w-[56px] min-h-[46px] py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors relative cursor-pointer ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            <div className="relative">
              <Icon className="w-5 h-5 mb-0.5" />
              {badge !== undefined && badge > 0 && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {badge}
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
