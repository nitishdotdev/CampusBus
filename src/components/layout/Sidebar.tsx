import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { Bus, MapPin, Route as RouteIcon, Bell, User, LayoutDashboard, Navigation, History, ShieldAlert, BarChart3, Users, Settings, Radio, Calendar, MessageSquare } from 'lucide-react';

interface SidebarNavItem {
  to: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; badgeColor?: string;
}

export const Sidebar: React.FC = () => {
  const { role, unreadCount, activeEmergencyCount, currentCollege } = useApp();

  const studentLinks: SidebarNavItem[] = [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/live', label: 'Live Map', icon: Navigation },
    { to: '/student/routes', label: 'Routes & Stops', icon: RouteIcon },
    { to: '/student/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/student/profile', label: 'Profile', icon: User },
    { to: '/student/schedules', label: 'Schedules', icon: Calendar },
    { to: '/student/complaints', label: 'Feedback', icon: MessageSquare },
  ];

  const driverLinks: SidebarNavItem[] = [
    { to: '/driver', label: 'Driver Terminal', icon: Navigation },
    { to: '/driver/history', label: 'Trip History', icon: History },
    { to: '/driver/profile', label: 'Vehicle & Duty', icon: Bus },
  ];

  const adminLinks: SidebarNavItem[] = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/fleet', label: 'Live Fleet Map', icon: Navigation },
    { to: '/admin/buses', label: 'Bus Fleet', icon: Bus },
    { to: '/admin/routes', label: 'Routes & Stops', icon: RouteIcon },
    { to: '/admin/directory', label: 'Drivers & Students', icon: Users },
    { to: '/admin/alerts', label: 'Alerts', icon: ShieldAlert, badge: activeEmergencyCount, badgeColor: 'bg-rose-600' },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
        { to: '/admin/schedules', label: 'Schedules', icon: Calendar },
    { to: '/admin/complaints', label: 'Complaints', icon: MessageSquare },
  ];

  const links = role === 'ADMIN' ? adminLinks : role === 'DRIVER' ? driverLinks : studentLinks;

  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-white border-r border-slate-800 shrink-0">
      <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
          <Bus className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-tight text-white">CampusMove</h1>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate max-w-[130px]">{currentCollege.shortCode}</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-800/50 bg-slate-950/40">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Workspace</div>
        <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-blue-400" />
          {role === 'ADMIN' ? 'Administration' : role === 'DRIVER' ? 'Bus Operator' : 'Student'}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/student' || item.to === '/admin' || item.to === '/driver'}
              className={({ isActive }) => `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}`}>
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${item.badgeColor ? `${item.badgeColor} text-white` : 'bg-blue-500 text-white'}`}>{item.badge}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 text-[11px] text-slate-400 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-300">{currentCollege.name}</div>
          <div className="text-[10px] text-slate-500">CampusMove</div>
        </div>
        <MapPin className="w-4 h-4 text-slate-500" />
      </div>
    </aside>
  );
};
