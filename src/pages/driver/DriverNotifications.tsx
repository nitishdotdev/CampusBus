import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { NotificationCard } from '../../components/common/Cards';
import { FilterBar } from '../../components/common/Inputs';
import { EmptyState } from '../../components/common/States';
import { notificationService } from '../../services/notificationService';
import { Bell, CheckCheck, ShieldAlert } from 'lucide-react';

export const DriverNotifications: React.FC = () => {
  const { notifications, unreadCount } = useApp();
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const filtered = notifications.filter((n) => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'UNREAD') return !n.isRead;
    return n.category === activeCategory;
  });

  const filterOptions = [
    { id: 'ALL', label: 'All Notices', count: notifications.length },
    { id: 'UNREAD', label: 'Unread', count: unreadCount },
    { id: 'EMERGENCY', label: 'Emergency Alerts' },
    { id: 'DELAY', label: 'Route Delays' },
    { id: 'ROUTE_CHANGE', label: 'Detours' },
    { id: 'ANNOUNCEMENT', label: 'Dispatch Broadcasts' },
  ];

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead();
  };

  const handleMarkRead = (id: string) => {
    notificationService.markAsRead(id);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Driver Dispatch &amp; Alerts</h2>
          <p className="text-xs text-slate-500">
            Emergency broadcasts, transit supervisor alerts, and campus detours
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      <FilterBar
        filters={filterOptions}
        activeFilter={activeCategory}
        onFilterChange={setActiveCategory}
      />

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onMarkRead={handleMarkRead}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No operational notices"
          description="There are currently no active dispatch alerts or announcements for your shift."
          icon={Bell}
        />
      )}
    </div>
  );
};
