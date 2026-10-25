import React from 'react';
import { BusStatus, RouteStatus, GPSStatus, NetworkStatus, ETAConfidence } from '../../types';
import { Radio, Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';

export const BusStatusBadge: React.FC<{ status: BusStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'md',
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  switch (status) {
    case 'ACTIVE':
      return (
        <span
          id={`bus-status-active`}
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      );
    case 'IDLE':
      return (
        <span
          id={`bus-status-idle`}
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Idle / Ready
        </span>
      );
    case 'MAINTENANCE':
      return (
        <span
          id={`bus-status-maint`}
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Depot Maintenance
        </span>
      );
    case 'OFFLINE':
    default:
      return (
        <span
          id={`bus-status-offline`}
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Offline
        </span>
      );
  }
};

export const RouteStatusBadge: React.FC<{ status: RouteStatus }> = ({ status }) => {
  switch (status) {
    case 'LIVE':
      return (
        <span
          id={`route-status-live`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          LIVE
        </span>
      );
    case 'DEGRADED':
      return (
        <span
          id={`route-status-degraded`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800"
        >
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          DEGRADED
        </span>
      );
    case 'SCHEDULED':
      return (
        <span
          id={`route-status-sched`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800"
        >
          <Clock className="w-3 h-3 text-blue-600" />
          SCHEDULED
        </span>
      );
    case 'OFFLINE':
    default:
      return (
        <span
          id={`route-status-off`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700"
        >
          OFFLINE
        </span>
      );
  }
};

export const GPSStatusBadge: React.FC<{ status: GPSStatus; lastUpdateText?: string }> = ({
  status,
  lastUpdateText,
}) => {
  switch (status) {
    case 'GPS_ACTIVE':
      return (
        <div
          id="gps-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
        >
          <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>GPS Active</span>
          {lastUpdateText && <span className="text-emerald-600">({lastUpdateText})</span>}
        </div>
      );
    case 'GPS_SEARCHING':
      return (
        <div
          id="gps-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          <span>Acquiring GPS Signal...</span>
        </div>
      );
    case 'GPS_PERMISSION_REQUIRED':
      return (
        <div
          id="gps-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Location Permission Required</span>
        </div>
      );
    case 'LOCATION_STALE':
      return (
        <div
          id="gps-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200"
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>GPS Stale &gt; 2 min</span>
        </div>
      );
    case 'GPS_UNAVAILABLE':
    default:
      return (
        <div
          id="gps-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          <span>GPS Signal Unavailable</span>
        </div>
      );
  }
};

export const NetworkStatusBadge: React.FC<{
  status: NetworkStatus;
  queuedCount?: number;
}> = ({ status, queuedCount = 0 }) => {
  switch (status) {
    case 'NETWORK_ONLINE':
      return (
        <div
          id="network-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
        >
          <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          <span>Online (Sync Active)</span>
        </div>
      );
    case 'SYNCING':
      return (
        <div
          id="network-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
          <span>Syncing Queued Data...</span>
        </div>
      );
    case 'LOCATION_QUEUED':
    case 'NETWORK_OFFLINE':
    default:
      return (
        <div
          id="network-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          <span>
            Offline • {queuedCount > 0 ? `${queuedCount} queued locally` : 'Queue ready'}
          </span>
        </div>
      );
  }
};

export const ETAIndicator: React.FC<{
  seconds?: number | null;
  confidence?: ETAConfidence;
  size?: 'sm' | 'md' | 'lg';
}> = ({ seconds, confidence = 'LIVE', size = 'md' }) => {
  const isAvailable =
    typeof seconds === 'number' &&
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    confidence !== 'OFFLINE';

  const minutes = isAvailable ? Math.max(1, Math.round(seconds! / 60)) : null;

  let timeText = isAvailable ? `~${minutes} min (est.)` : '--';
  if (confidence === 'SCHEDULED') {
    timeText = isAvailable ? `~${minutes} min (sched.)` : 'Scheduled';
  } else if (confidence === 'OFFLINE') {
    timeText = 'Unavailable';
  } else if (isAvailable && minutes! <= 1) {
    timeText = 'Due now';
  }

  const confidenceBadge = {
    LIVE: {
      label: 'LIVE',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    DEGRADED: {
      label: 'DEGRADED',
      bg: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    STALE: {
      label: 'STALE',
      bg: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    OFFLINE: {
      label: 'OFFLINE',
      bg: 'bg-rose-100 text-rose-800 border-rose-200',
    },
    SCHEDULED: {
      label: 'SCHEDULED',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
    },
  }[confidence] || {
    label: 'UNAVAILABLE',
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  if (size === 'sm') {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="font-semibold text-slate-800">{timeText}</span>
        <span className={`px-1 rounded text-[10px] font-bold border ${confidenceBadge.bg}`}>
          {confidenceBadge.label}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-base font-bold text-slate-900">{timeText}</span>
      <span
        className={`px-1.5 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase border ${confidenceBadge.bg}`}
      >
        {confidenceBadge.label}
      </span>
    </div>
  );
};

export const OccupancyIndicator: React.FC<{
  current: number;
  capacity: number;
  showBar?: boolean;
}> = ({ current, capacity, showBar = true }) => {
  const percent = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;

  let colorClass = 'bg-emerald-500';
  let textClass = 'text-emerald-700';
  let label = 'Seats Available';

  if (percent >= 90) {
    colorClass = 'bg-rose-500';
    textClass = 'text-rose-700';
    label = 'Full / Standing Only';
  } else if (percent >= 65) {
    colorClass = 'bg-amber-500';
    textClass = 'text-amber-700';
    label = 'Moderate Occupancy';
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-600">Occupancy: {label}</span>
        <span className={`font-semibold ${textClass}`}>
          {current} / {capacity} ({percent}%)
        </span>
      </div>
      {showBar && (
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
};
