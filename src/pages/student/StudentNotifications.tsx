import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { NotificationCard } from '../../components/common/Cards';
import { FilterBar } from '../../components/common/Inputs';
import { EmptyState } from '../../components/common/States';
import { Bell, CheckCheck, ShieldAlert } from 'lucide-react';

export const StudentNotifications: React.FC = () => {
  const { notifications, markNotificationsRead, unreadCount } = useApp();
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const filtered = notifications.filter((n) => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'UNREAD') return !n.isRead;
    return n.category === activeCategory;
  });

  const filterOptions = [
    { id: 'ALL', label: 'All Notices', count: notifications.length },
    { id: 'UNREAD', label: 'Unread', count: unreadCount },
    { id: 'EMERGENCY', label: 'Emergency' },
    { id: 'DELAY', label: 'Delays' },
    { id: 'ROUTE_CHANGE', label: 'Route Changes' },
    { id: 'ANNOUNCEMENT', label: 'Announcements' },
  ];

  const handleMarkAllRead = () => {
    markNotificationsRead(notifications.map(item => item.id));
  };

  const handleMarkRead = (id: string) => {
    markNotificationsRead([id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campus Transit Notifications</h2>
          <p className="text-xs text-slate-500">
            Emergency alerts, route detours, and operational announcements
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all as read</span>
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
          title="No notifications found"
          description="There are currently no transport announcements matching your selected category filter."
          icon={Bell}
        />
      )}
    </div>
  );
};
