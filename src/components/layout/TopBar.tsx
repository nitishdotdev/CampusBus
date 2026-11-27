import React from 'react';
import { useApp } from '../../store/AppContext';
import {
  Bell,
  LogOut,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const TopBar: React.FC<{ onOpenMobileMenu?: () => void }> = () => {
  const {
    currentUser,
    role,
    currentCollege,
    logout,
    unreadCount,
    activeEmergencyCount,
    locationState,
  } = useApp();

  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Institution Context */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {currentCollege.shortCode}
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-bold text-slate-900 leading-none block">
                {currentCollege.name}
              </span>
              <span className="text-[11px] text-slate-500">{currentCollege.campusName}</span>
            </div>
          </div>

          {/* Network Offline Indicator */}
          {(locationState.networkStatus === 'NETWORK_OFFLINE' ||
            locationState.isSimulatedOffline) && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>Offline — changes saved locally</span>
            </div>
          )}
        </div>

        {/* Right: Notifications, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notifications */}
          <Link
            to={role === 'ADMIN' ? '/admin/alerts' : role === 'DRIVER' ? '/driver/notifications' : '/student/notifications'}
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Notifications"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span aria-hidden="true" className="absolute top-1.5 right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-blue-700 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            {activeEmergencyCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-600 animate-ping" />
            )}
          </Link>

          {/* User info & logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-slate-600 text-xs font-bold border border-slate-300">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="w-4 h-4" />
              )}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <div className="text-xs font-bold text-slate-800">{currentUser?.name}</div>
              <div className="text-[10px] text-slate-500">{currentUser?.email}</div>
            </div>

            <button
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
