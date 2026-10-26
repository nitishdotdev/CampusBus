import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { StudentLiveBuses } from './StudentLiveBuses';
import { Bell, Calendar, MessageSquare, Route as RouteIcon } from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { currentUser, currentCollege, buses, notifications, isLoadingData } = useApp();
  const activeBuses = buses.filter((b) => b.status === 'ACTIVE');
  const unread = notifications.filter((n) => !n.isRead).length;

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-6 h-40" />
        <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-6 h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-2xl p-5 shadow-sm">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-700/60 border border-blue-500/40 text-xs font-semibold text-blue-100 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{currentCollege.name}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight">
          Welcome{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}
        </h2>
        <p className="text-xs sm:text-sm text-blue-100 mt-1 max-w-xl">
          {activeBuses.length > 0
            ? `${activeBuses.length} campus shuttle${activeBuses.length !== 1 ? 's' : ''} currently broadcasting live GPS.`
            : 'No buses are running yet. The map will update when a driver starts a trip.'}
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link to="/student/routes" className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 min-h-11">
            <RouteIcon className="w-4 h-4" /> Routes & Stops
          </Link>
          <Link to="/student/schedules" className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 min-h-11">
            <Calendar className="w-4 h-4" /> Schedules
          </Link>
          <Link to="/student/notifications" className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 min-h-11">
            <Bell className="w-4 h-4" /> Notices{unread > 0 ? ` (${unread})` : ''}
          </Link>
          <Link to="/student/complaints" className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 min-h-11">
            <MessageSquare className="w-4 h-4" /> Complaints
          </Link>
        </div>
      </div>

      <StudentLiveBuses />
    </div>
  );
};
