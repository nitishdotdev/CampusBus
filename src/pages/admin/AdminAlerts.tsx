import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { adminService } from '../../services/adminService';
import { NotificationCategory, NotificationPriority } from '../../types';
import { notificationsV1, alertsV1 } from '../../services/v1/notifications';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';
import {
  ShieldAlert,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  Bell,
  MessageSquare,
} from 'lucide-react';

export const AdminAlerts: React.FC = () => {
  const { emergencyAlerts, notifications, routes } = useApp();

  // Announcement Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<NotificationCategory>('ANNOUNCEMENT');
  const [priority, setPriority] = useState<NotificationPriority>('NORMAL');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [publishedSuccess, setPublishedSuccess] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    if (USE_V1) {
      const kindMap: Record<string, 'ANNOUNCEMENT' | 'DELAY' | 'ROUTE_CHANGE' | 'EMERGENCY'> = {
        ANNOUNCEMENT: 'ANNOUNCEMENT', DELAY: 'DELAY',
        ROUTE_CHANGE: 'ROUTE_CHANGE', EMERGENCY: 'EMERGENCY',
      };
      const prioMap: Record<string, 'NORMAL' | 'HIGH' | 'URGENT'> = {
        LOW: 'NORMAL', MEDIUM: 'NORMAL', HIGH: 'HIGH', URGENT: 'URGENT', CRITICAL: 'URGENT',
      };
      await notificationsV1.broadcast({
        kind: kindMap[category as string] ?? 'ANNOUNCEMENT',
        priority: prioMap[priority as string] ?? 'NORMAL',
        title: title.trim(),
        body: message.trim(),
        routeId: selectedRouteId || undefined,
      });
    } else {
      adminService.broadcastNotification({
        collegeId: 'college_apex',
        title: title.trim(),
        message: message.trim(),
        category,
        priority,
        routeId: selectedRouteId || undefined,
      });
    }
    setTitle('');
    setMessage('');
    setPublishedSuccess(true);
    setTimeout(() => setPublishedSuccess(false), 4000);
  };

  const handleAcknowledge = async (id: string) => {
    if (USE_V1) await alertsV1.acknowledge(id);
    else adminService.acknowledgeAlert(id, 'Admin Dispatch Center');
  };

  const handleResolve = async (id: string) => {
    if (USE_V1) await alertsV1.resolve(id);
    else adminService.resolveAlert(id, 'Response unit on-scene. Incident secured.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Alerts, Incidents & Broadcast Center</h2>
        <p className="text-xs text-slate-500">
          Respond to live vehicle emergency triggers and issue campus-wide passenger advisories
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Campus Announcement Publisher */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Publish Transport Advisory</h3>
              <p className="text-xs text-slate-500">
                Immediately broadcasts to student dashboards and mobile feeds
              </p>
            </div>
          </div>

          {publishedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Announcement successfully broadcast to all campus commuters!</span>
            </div>
          )}

          <form onSubmit={handleBroadcast} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Advisory Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 15-Minute Heavy Traffic Delay on South Connector"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as NotificationCategory)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <option value="ANNOUNCEMENT">General Announcement</option>
                  <option value="DELAY">Traffic / Transit Delay</option>
                  <option value="ROUTE_CHANGE">Route Detour / Change</option>
                  <option value="EMERGENCY">Emergency Advisory</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="NORMAL">Normal (Feed)</option>
                  <option value="HIGH">High (Notification Badge)</option>
                  <option value="URGENT">Urgent (Banner Overlay)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Affects Specific Line (Optional)
              </label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <option value="">All Campus Lines</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Advisory Message *</label>
              <textarea
                rows={3}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Provide details, detour instructions, or estimated resolution times..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <button
              id="broadcast-advisory-button"
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Broadcast Notice Instantly</span>
            </button>
          </form>
        </div>

        {/* Right Column: Emergency Incidents Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Emergency Incidents Queue</h3>
                <p className="text-xs text-slate-500">Active driver safety triggers</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              {emergencyAlerts.length} Total Logs
            </span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {emergencyAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  alert.status === 'ACTIVE'
                    ? 'bg-rose-50/70 border-rose-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 ${
                        alert.status === 'ACTIVE'
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {alert.status}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">{alert.reason}</h4>
                    <p className="text-slate-600 text-xs mt-0.5">
                      Bus {alert.busNumber} • {alert.routeName} • Driver {alert.driverName}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 shrink-0">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 font-mono">
                  Coordinates: [{alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}]
                </div>

                {alert.status !== 'RESOLVED' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-rose-200">
                    {alert.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg cursor-pointer text-xs transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs transition-colors shadow-2xs"
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
