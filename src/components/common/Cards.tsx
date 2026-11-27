import React from 'react';
import { Bus, Route, CampusNotification, EmergencyAlert } from '../../types';
import { BusStatusBadge, ETAIndicator, OccupancyIndicator, RouteStatusBadge } from './StatusBadges';
import {
  Bus as BusIcon,
  Navigation,
  Clock,
  AlertTriangle,
  Radio,
  ChevronRight,
  ShieldAlert,
  Bell,
  CheckCircle,
} from 'lucide-react';

export const BusCard: React.FC<{
  bus: Bus;
  route?: Route;
  isSelected?: boolean;
  onSelect?: (bus: Bus) => void;
}> = ({ bus, route, isSelected = false, onSelect }) => {
  const isSelectedStyle = isSelected
    ? 'ring-2 ring-blue-600 bg-blue-50/40 border-blue-300'
    : 'hover:border-slate-300 bg-white';

  return (
    <div
      id={`bus-card-${bus.id}`}
      onClick={() => onSelect && onSelect(bus)}
      className={`rounded-xl border border-slate-200 p-4 transition-all duration-150 shadow-xs cursor-pointer ${isSelectedStyle}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
            <BusIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 leading-tight">{bus.busNumber}</h4>
            <p className="text-xs text-slate-500">{bus.model.split(' ')[0]} • {bus.plateNumber}</p>
          </div>
        </div>
        <BusStatusBadge status={bus.status} size="sm" />
      </div>

      {route ? (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-700">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: route.color }}
          />
          <span className="font-semibold text-slate-800">{route.code}:</span>
          <span className="truncate">{route.name}</span>
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-3 italic">No active route assigned</p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Navigation className="w-3 h-3 text-slate-400" /> Next Stop
          </div>
          <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
            {bus.nextStopId ? 'Approaching Stop' : 'Terminal / Idle'}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" /> Est. Arrival
          </div>
          <div className="mt-0.5">
            <ETAIndicator
              seconds={bus.etaToNextStopSeconds}
              confidence={bus.etaConfidence}
              size="sm"
            />
          </div>
        </div>
      </div>

      <OccupancyIndicator current={bus.currentOccupancy} capacity={bus.capacity} />

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Radio className="w-3 h-3 text-emerald-500" />
          {bus.gpsStatus === 'GPS_ACTIVE' ? 'GPS Active' : 'Degraded signal'}
        </span>
        <span className="text-blue-600 font-medium flex items-center gap-0.5">
          View details <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
};

export const RouteCard: React.FC<{
  route: Route;
  activeBusesCount?: number;
  onSelect?: (route: Route) => void;
}> = ({ route, activeBusesCount = 0, onSelect }) => {
  return (
    <div
      id={`route-card-${route.id}`}
      onClick={() => onSelect && onSelect(route)}
      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
            style={{ backgroundColor: route.color }}
          />
          <h3 className="font-bold text-slate-900 text-sm">
            {route.code} — {route.name}
          </h3>
        </div>
        <RouteStatusBadge status={route.status} />
      </div>

      <p className="text-xs text-slate-600 mb-3 line-clamp-2">{route.description}</p>

      <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
        <div className="flex items-center gap-1.5">
          <BusIcon className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-semibold text-slate-800">
            {activeBusesCount} {activeBusesCount === 1 ? 'bus' : 'buses'} active
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Every {route.frequencyMinutes} min</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
        <span className="text-slate-500">{route.stops.length} scheduled stops</span>
        <span className="text-blue-600 font-medium flex items-center gap-0.5">
          Route timetable <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
};

export const NotificationCard: React.FC<{
  notification: CampusNotification;
  onMarkRead?: (id: string) => void;
}> = ({ notification, onMarkRead }) => {
  const isEmergency = notification.priority === 'EMERGENCY' || notification.category === 'EMERGENCY';

  const categoryIcons = {
    EMERGENCY: <ShieldAlert className="w-4 h-4 text-rose-600" />,
    DELAY: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    ROUTE_CHANGE: <Navigation className="w-4 h-4 text-blue-600" />,
    CANCELLATION: <AlertTriangle className="w-4 h-4 text-red-600" />,
    ANNOUNCEMENT: <Bell className="w-4 h-4 text-indigo-600" />,
  };

  const bgStyle = isEmergency
    ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300'
    : notification.isRead
    ? 'bg-white border-slate-200'
    : 'bg-blue-50/40 border-blue-200';

  return (
    <div
      id={`notif-${notification.id}`}
      className={`rounded-xl border p-4 transition-all ${bgStyle}`}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-white shadow-2xs border border-slate-100">
            {categoryIcons[notification.category] || <Bell className="w-4 h-4 text-slate-600" />}
          </div>
          <div>
            <h4
              className={`text-sm font-bold ${
                isEmergency ? 'text-rose-950' : 'text-slate-900'
              }`}
            >
              {notification.title}
            </h4>
            <span className="text-[11px] text-slate-600">
              {new Date(notification.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {!notification.isRead && onMarkRead && (
          <button
            onClick={() => onMarkRead(notification.id)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Mark read
          </button>
        )}
      </div>

      <p
        className={`text-xs mt-2 leading-relaxed ${
          isEmergency ? 'text-rose-900 font-medium' : 'text-slate-700'
        }`}
      >
        {notification.message}
      </p>
    </div>
  );
};

export const AlertCard: React.FC<{
  alert: EmergencyAlert;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}> = ({ alert, onAcknowledge, onResolve }) => {
  return (
    <div
      id={`emergency-alert-${alert.id}`}
      className="bg-rose-50 border border-rose-300 rounded-xl p-4 shadow-xs"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center animate-pulse">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-900 uppercase">
                {alert.status}
              </span>
              <span className="text-xs text-rose-700">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <h4 className="font-bold text-slate-900 text-sm mt-0.5">
              Bus {alert.busNumber} • {alert.routeName}
            </h4>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-700 mb-2">
        <strong>Driver:</strong> {alert.driverName} (ID: {alert.driverId})
      </p>

      {alert.reason && (
        <p className="text-xs bg-white/80 p-2.5 rounded-lg border border-rose-200 text-slate-800 mb-3">
          <strong>Incident Report:</strong> {alert.reason}
        </p>
      )}

      <div className="text-[11px] text-slate-600 mb-3">
        <strong>Coordinates:</strong> {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)}{' '}
        (Accuracy ±{alert.location.accuracy || 10}m)
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-rose-200">
        {alert.status === 'ACTIVE' && onAcknowledge && (
          <button
            id={`ack-alert-${alert.id}`}
            onClick={() => onAcknowledge(alert.id)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Acknowledge Incident
          </button>
        )}
        {alert.status !== 'RESOLVED' && onResolve && (
          <button
            id={`resolve-alert-${alert.id}`}
            onClick={() => onResolve(alert.id)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Mark Resolved
          </button>
        )}
        {alert.acknowledgedBy && (
          <span className="text-xs text-slate-500 italic ml-auto">
            Ack by {alert.acknowledgedBy}
          </span>
        )}
      </div>
    </div>
  );
};
