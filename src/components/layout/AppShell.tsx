import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNavigation } from './MobileNavigation';
import { useApp } from '../../store/AppContext';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/authService';

export const AppShell: React.FC = () => {
  const { emergencyAlerts, role, currentUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const activeAlert = emergencyAlerts.find((a) => a.status === 'ACTIVE');

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate('/roles', { replace: true });
    }
  }, [currentUser, navigate]);

  // Role-based redirect guard
  useEffect(() => {
    if (!currentUser) return;
    const path = location.pathname;
    const userRole = currentUser.role;

    if (path.startsWith('/admin') && userRole !== 'ADMIN') {
      navigate(`/${userRole.toLowerCase()}`, { replace: true });
    } else if (path.startsWith('/driver') && userRole !== 'DRIVER') {
      navigate(`/${userRole.toLowerCase()}`, { replace: true });
    } else if (path.startsWith('/student') && userRole !== 'STUDENT') {
      navigate(`/${userRole.toLowerCase()}`, { replace: true });
    }
  }, [currentUser, location.pathname, navigate]);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Column */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <TopBar />

        {/* Emergency Alert Notification Bar if Active Incident */}
        {activeAlert && (
          <div className="bg-rose-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs z-20">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Active Transit Incident: Bus {activeAlert.busNumber} on {activeAlert.routeName}
              </span>
            </div>
            <Link
              to={role === 'ADMIN' ? '/admin/alerts' : '/student/notifications'}
              className="ml-2 underline text-white hover:text-rose-100 shrink-0 flex items-center gap-0.5 text-[11px]"
            >
              View Status <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 pb-20 md:pb-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNavigation />
      </div>
    </div>
  );
};
