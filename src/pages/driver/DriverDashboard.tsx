import { WorkspaceHeading } from '../../components/common/WorkspaceHeading';
import { confirmTripChange, needsTripConfirmation, type TripChange } from '../../services/tripReconciliation';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../store/AppContext';
import { tripService } from '../../services/tripService';
import { tripsV1, type V1Trip } from '../../services/v1/trips';
import { alertsV1 } from '../../services/v1/notifications';
import { ApiV1Error } from '../../services/v1/client';
import {
  canStartEmergencySubmission, emergencyCopy, failureMessageForCreate, reconcileUncertainEmergency,
  shouldRetryWithoutTrip, stateFromAlertRecord, type EmergencyAttempt, type EmergencyState,
} from '../../services/emergencyPolicy';
import { locationService } from '../../services/locationService';
import { verdictText } from '../../services/gpsQuality';
import { GPSStatusBadge, NetworkStatusBadge } from '../../components/common/StatusBadges';

import { Modal, ConfirmDialog } from '../../components/common/Modals';
import {
  Play,
  Square,
  Users,
  Plus,
  Minus,
  AlertTriangle,
  Radio,
  Wifi,
  WifiOff,
  Navigation,
  CheckCircle2,
  Clock,
  Compass,
  Bus as BusIcon,
  ShieldAlert,
  Smartphone,
  RefreshCw,
  HelpCircle,
  MapPin,
} from 'lucide-react';

import { MapView } from '../../components/map/MapView';
import { EmptyState } from '../../components/common/States';

/** Emergency status refresh while the server still reports OPEN. */
const EMERGENCY_STATUS_POLL_MS = 10_000;
/** Reconciliation attempts after an uncertain submission, and the wait between them. */
const RECONCILE_ROUNDS = 6;
const RECONCILE_DELAY_MS = 5_000;

export const DriverDashboard: React.FC = () => {
  const {
    currentUser,
    currentCollege,
    activeTrip,
    buses,
    routes,
    locationState,
    refreshData,
    isLoadingData,
    toggleSimulatedOffline,
  } = useApp();

  const [tripError, setTripError] = useState<string | null>(null);
  const [tripBusy, setTripBusy] = useState(false);
  const [uncertainTrip, setUncertainTrip] = useState<TripChange | null>(null);
  const tripControlsLocked = tripBusy || uncertainTrip !== null;
  const assignedBus = buses.find(bus => bus.id === activeTrip?.busId) ??
    buses.find(bus => bus.currentDriverId === currentUser?.id);
  const assignedRoute = routes.find(route => route.id === (activeTrip?.routeId ?? assignedBus?.currentRouteId));

  const [showStartTripModal, setShowStartTripModal] = useState(false);
  const [showEndTripConfirm, setShowEndTripConfirm] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showGpsHelpModal, setShowGpsHelpModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('Mechanical breakdown / safe curb stop');
  const [emergency, setEmergency] = useState<EmergencyState>({ kind: 'IDLE' });
  /** Guards against a second submission from a double tap before React re-renders. */
  const emergencyInFlight = useRef(false);
  /** Alert IDs the driver already had, so an uncertain submission can be matched to the new alert. */
  const [tripSummary, setTripSummary] = useState<V1Trip | null>(null);

  // Time elapsed in active trip
  const [tripElapsedMins, setTripElapsedMins] = useState(0);

  useEffect(() => {
    if (!activeTrip) {
      setTripElapsedMins(0);
      return;
    }
    const updateElapsed = () => {
      const start = new Date(activeTrip.startTime).getTime();
      const now = Date.now();
      setTripElapsedMins(Math.max(0, Math.floor((now - start) / (60 * 1000))));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 30000);
    return () => clearInterval(interval);
  }, [activeTrip]);

  const applyConfirmedTrip = async (change: TripChange, trip: V1Trip) => {
    setUncertainTrip(null);
    setTripError(null);
    if (change.kind === 'starting') {
      const sameTrip = tripService.getActiveTrip()?.id === trip.id;
      tripService.adoptV1Trip(trip);
      if (!sameTrip) locationService.startTracking(trip.id, trip.busId, trip.driverId);
    } else {
      if (tripService.getActiveTrip()?.id === trip.id) tripService.clearActiveTrip();
      void locationService.attemptSyncQueuedLocations();
      if (trip.status === 'COMPLETED') setTripSummary(trip);
    }
    await refreshData();
  };

  const reconcileTrip = async (change: TripChange) => {
    try {
      const trip = change.kind === 'starting'
        ? (await tripsV1.list(1, 1, 'ACTIVE')).items[0]
        : (await tripsV1.get(change.tripId)).trip;
      const confirmed = confirmTripChange(change, trip);
      if (confirmed) {
        await applyConfirmedTrip(change, confirmed);
        return;
      }
    } catch { /* retain uncertainty until an authoritative response is available */ }
    setUncertainTrip(change);
  };

  const submitTripChange = async (change: TripChange) => {
    setTripBusy(true);
    setTripError(null);
    try {
      const { trip } = change.kind === 'starting' ? await tripsV1.start(change.busId) : await tripsV1.end(change.tripId);
      await applyConfirmedTrip(change, trip);
    } catch (error) {
      if (needsTripConfirmation(error)) await reconcileTrip(change);
      else setTripError(change.kind === 'starting'
        ? 'Could not start the trip. Check your vehicle assignment and try again.'
        : 'Could not end the trip. Check the trip status and try again.');
    } finally {
      setTripBusy(false);
    }
  };

  const handleStartTrip = () => {
    if (!assignedBus || !assignedRoute || !currentUser || tripControlsLocked) return;
    setShowStartTripModal(false);
    void submitTripChange({ kind: 'starting', busId: assignedBus.id, driverId: currentUser.id });
  };

  const handleEndTrip = () => {
    if (!activeTrip || tripControlsLocked) return;
    setShowEndTripConfirm(false);
    void submitTripChange({ kind: 'ending', tripId: activeTrip.id });
  };

  const retryTripCheck = async () => {
    if (!uncertainTrip || tripBusy) return;
    setTripBusy(true);
    try { await reconcileTrip(uncertainTrip); }
    finally { setTripBusy(false); }
  };

  const handleOccupancyChange = async (delta: number) => {
    if (!activeTrip || tripControlsLocked) return;
    setTripBusy(true);
    setTripError(null);
    try {
      const { trip } = await tripsV1.updateOccupancy(activeTrip.id, delta);
      tripService.adoptV1Trip(trip);
      await refreshData();
    } catch {
      setTripError('Could not update passenger occupancy. Refresh to confirm the current count.');
    } finally {
      setTripBusy(false);
    }
  };

  // Poll the exact alert until it is resolved.
  const watchedAlertId = emergency.kind === 'SENT' && emergency.status !== 'RESOLVED' ? emergency.alertId : null;
  useEffect(() => {
    if (!watchedAlertId) return;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const match = await alertsV1.get(watchedAlertId);
        setEmergency(prev => prev.kind === 'SENT' && prev.alertId === watchedAlertId ? stateFromAlertRecord(match) : prev);
      } catch { /* keep the last confirmed status */ }
      finally { pending = false; }
    }, EMERGENCY_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [watchedAlertId]);

  const reconcileEmergency = useCallback(async (attempt: EmergencyAttempt) => {
    if (!currentUser) return;
    for (let round = 0; round < RECONCILE_ROUNDS; round += 1) {
      try {
        const alert = await alertsV1.get(attempt.requestId);
        const result = reconcileUncertainEmergency(attempt, alert, currentUser.id);
        if (result.kind === 'FOUND') {
          setEmergency(prev => (prev.kind === 'UNCERTAIN' && prev.attempt === attempt ? result.state : prev));
          return;
        }
      } catch { /* stays unconfirmed until the server answers */ }
      await new Promise(resolve => window.setTimeout(resolve, RECONCILE_DELAY_MS));
    }
  }, [currentUser]);

  /**
   * Sends an emergency alert. Independent of trip mutations: no shared busy flag, so a pending trip request never
   * blocks it. A definitive server error is FAILED. A timeout or no response is UNCERTAIN and is reconciled with the
   * server before anything is claimed.
   */
  const submitEmergency = async (attempt: EmergencyAttempt, retry: boolean) => {
    if (emergencyInFlight.current) return;
    emergencyInFlight.current = true;
    setEmergency({ kind: 'SUBMITTING' });
    const { tripId, ...payload } = attempt;
    try {
      let created;
      try {
        created = await alertsV1.raise({ ...payload, tripId });
      } catch (error) {
        // The trip may have ended between the tap and the request. A bus-level alert is still valid.
        if (error instanceof ApiV1Error && shouldRetryWithoutTrip(error, Boolean(tripId))) {
          created = await alertsV1.raise(payload);
        } else {
          throw error;
        }
      }
      setEmergency(stateFromAlertRecord(created));
    } catch (error) {
      // Only a 4xx answer is definitive. A 5xx may follow a stored alert, so it is treated as uncertain.
      const definitive = !retry && error instanceof ApiV1Error && error.status >= 400 && error.status < 500;
      if (definitive) {
        setEmergency({ kind: 'FAILED', message: failureMessageForCreate(error as ApiV1Error, currentCollege.dispatchPhone) });
      } else {
        // No response or timeout: the server may already have stored the alert. Do not claim either outcome.
        setEmergency({ kind: 'UNCERTAIN', attempt });
        void reconcileEmergency(attempt);
      }
    } finally {
      emergencyInFlight.current = false;
    }
  };

  const handleSendEmergency = () => {
    if (!assignedBus || !currentUser || !canStartEmergencySubmission(emergency)) return;
    setShowEmergencyModal(false);
    const fix = locationState.lastLocation;
    const location = fix && locationState.gpsStatus === 'GPS_ACTIVE' ? { lat: fix.lat, lng: fix.lng } : undefined;
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    void submitEmergency({ requestId, busId: assignedBus.id, message: emergencyReason, tripId: activeTrip?.id, location }, false);
  };

  const retryGps = () => {
    if (activeTrip && currentUser) locationService.startTracking(activeTrip.id, activeTrip.busId, currentUser.id);
    setShowGpsHelpModal(false);
  };

  const emergencyNotice = emergencyCopy(emergency, currentCollege.dispatchPhone);

  if (isLoadingData) return <p role="status" className="p-4 text-sm text-slate-600">Loading your assignment…</p>;

  if (!assignedBus || !assignedRoute) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-4">
        <WorkspaceHeading title="Driver workspace" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <BusIcon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">No Vehicle Assigned</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Welcome, <strong>{currentUser?.name || 'Driver'}</strong>. Your driver account is active, but you have not yet been assigned a bus and route by campus dispatch.
          </p>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 max-w-sm mx-auto">
            Please contact your campus transit administrator to assign a vehicle and route in the Administration panel.
          </div>
        </div>
      </div>
    );
  }

  const occupancy = activeTrip ? activeTrip.currentOccupancy : assignedBus.currentOccupancy;
  const capacity = assignedBus.capacity || 45;
  const occupancyPercent = Math.min(100, Math.round((occupancy / capacity) * 100));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <WorkspaceHeading title="Driver workspace" description={`Vehicle ${assignedBus.busNumber} · Route ${assignedRoute.code}`} />
      {uncertainTrip && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>{uncertainTrip.kind === 'starting' ? 'Trip start could not be confirmed.' : 'Trip end could not be confirmed.'}</p>
          <button type="button" disabled={tripBusy} onClick={() => void retryTripCheck()} className="min-h-11 font-semibold underline">
            Check trip status
          </button>
          <button type="button" disabled={tripBusy} onClick={() => void submitTripChange(uncertainTrip)} className="ml-4 min-h-11 font-semibold underline">
            {uncertainTrip.kind === 'starting' ? 'Retry trip start' : 'Retry trip end'}
          </button>
        </div>
      )}
      {tripError && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{tripError}</span>
        </div>
      )}

      {/* Driver & Duty Status Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
              <BusIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-none">
                  {currentUser?.name || 'Driver'}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Assigned: <strong className="text-slate-800">{assignedBus.busNumber}</strong> · Route{' '}
                <strong className="text-slate-800">{assignedRoute.code}</strong>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                activeTrip
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {activeTrip ? 'Trip active' : assignedBus.operationalStatus === 'ACTIVE' ? 'Ready for service' : 'Vehicle unavailable'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Trip Action Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        {!activeTrip ? (
          <div className="space-y-4 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-1">
              <Play className="w-7 h-7 ml-1" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Ready to Begin Campus Service</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Starting your trip requests browser location access and starts broadcasting your live
                GPS coordinates to waiting students.
              </p>
            </div>

            <button
              id="start-trip-button" disabled={tripControlsLocked || assignedBus.operationalStatus !== 'ACTIVE'}
              onClick={() => setShowStartTripModal(true)}
              className="w-full sm:w-80 py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-base rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start trip</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  Trip in progress
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {assignedRoute.code}: {assignedRoute.name}
                </h3>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-600 font-medium">Trip Duration</div>
                <div className="text-lg font-bold text-slate-900 font-mono">
                  {tripElapsedMins} min
                </div>
              </div>
            </div>

            {/* End Trip Button */}
            <button
              id="end-trip-button" disabled={tripControlsLocked}
              onClick={() => setShowEndTripConfirm(true)}
              className="w-full min-h-[52px] py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Square className="w-4 h-4 fill-current text-rose-400" />
              <span>End trip</span>
            </button>
            {/* Active Next Stop Target & Progression Card */}
            {(() => {
              const stops = [...(assignedRoute.stops || [])].sort((a, b) => a.sequence - b.sequence);
              const completedIds = new Set(activeTrip?.completedStopIds || []);
              const nextStop = stops.find(stop => stop.id === activeTrip?.nextStopId);

              let distanceText = '';
              let isApproaching = false;
              let isWithinGeofence = false;
              if (nextStop && locationState.lastLocation && locationState.gpsStatus === 'GPS_ACTIVE') {
                const lat1 = (locationState.lastLocation.lat * Math.PI) / 180;
                const lat2 = (nextStop.lat * Math.PI) / 180;
                const dLat = ((nextStop.lat - locationState.lastLocation.lat) * Math.PI) / 180;
                const dLng = ((nextStop.lng - locationState.lastLocation.lng) * Math.PI) / 180;
                const a =
                  Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
                const distMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                if (distMeters <= 50) {
                  isWithinGeofence = true;
                  distanceText = `${Math.round(distMeters)}m away (In 50m Arrival Zone)`;
                } else if (distMeters <= 150) {
                  isApproaching = true;
                  distanceText = `${Math.round(distMeters)}m away (Approaching)`;
                } else if (distMeters < 1000) {
                  distanceText = `${Math.round(distMeters)}m away`;
                } else {
                  distanceText = `${(distMeters / 1000).toFixed(1)} km away`;
                }
              }

              const completedCount = completedIds.size;
              const totalCount = stops.length;

              return (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Next Eligible Stop</div>
                        <div className="text-sm font-black text-slate-900">
                          {nextStop ? nextStop.name : (completedCount === totalCount && totalCount > 0 ? 'All Stops Completed' : 'Next stop unavailable')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-slate-600">
                        {completedCount} / {totalCount} stops
                      </span>
                      {isWithinGeofence && (
                        <div className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full mt-0.5 animate-pulse">
                          Arrival Zone (50m)
                        </div>
                      )}
                      {!isWithinGeofence && isApproaching && (
                        <div className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-0.5">
                          Approaching Stop
                        </div>
                      )}
                    </div>
                  </div>
                  {distanceText && (
                    <div className="text-xs text-blue-900 font-medium flex items-center gap-1.5 pt-1 border-t border-blue-100/80">
                      <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Distance to target: <strong>{distanceText}</strong></span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* GPS & Network Status Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    GPS Telemetry Device
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGpsHelpModal(true)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>GPS Help</span>
                  </button>
                </div>
                <GPSStatusBadge
                  status={locationState.gpsStatus}
                  lastUpdateText={locationState.lastLocation?.accuracy != null ? `±${Math.round(locationState.lastLocation.accuracy)} m` : undefined}
                />
                <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
                  {locationState.lastLocation
                    ? `${locationState.lastLocation.lat.toFixed(5)}, ${locationState.lastLocation.lng.toFixed(5)}`
                    : 'Awaiting first coordinates...'}
                </div>
                <div className="mt-2 space-y-1 text-xs" aria-live="polite">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Server status</span>
                    {locationState.lastVerdict ? (() => {
                      const verdict = verdictText(locationState.lastVerdict);
                      const tone = verdict.tone === 'ok' ? 'text-emerald-700' : verdict.tone === 'error' ? 'text-red-700' : 'text-amber-800';
                      return <span className={`font-semibold ${tone}`}>{verdict.label}</span>;
                    })() : <span className="font-semibold text-slate-600">Waiting for server confirmation</span>}
                  </div>
                  {locationState.lastVerdict && <p className="text-slate-500">{verdictText(locationState.lastVerdict).detail}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Last accepted live</span>
                    <span className="font-mono text-slate-700">
                      {locationState.lastAcceptedLive ? `${new Date(locationState.lastAcceptedLive.timestamp).toLocaleTimeString()}` : 'None yet'}
                    </span>
                  </div>
                  {Object.keys(locationState.rejectionCounts).length > 0 && (
                    <p className="text-slate-500">
                      Rejected this session: {Object.entries(locationState.rejectionCounts).map(([reason, count]) => `${count} x ${reason.toLowerCase().replace(/_/g, ' ')}`).join(', ')}
                    </p>
                  )}
                </div>
                {locationState.errorMessage && <p role="status" className="mt-2 text-xs text-amber-900">{locationState.errorMessage}</p>}
                {locationState.gpsStatus !== 'GPS_ACTIVE' && (
                  <button type="button" onClick={retryGps} className="min-h-11 text-xs font-semibold text-blue-700 underline">Retry GPS</button>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Network Connectivity & Queue
                </div>
                <NetworkStatusBadge
                  status={locationState.networkStatus}
                  queuedCount={locationState.queuedCount}
                />
                <div className="text-[11px] text-slate-500 mt-1.5">
                  {locationState.queuedCount > 0 ? (
                    <span className="text-amber-700 font-semibold">
                      {locationState.queuedCount} location pings waiting to send
                    </span>
                  ) : (
                    <span className="text-emerald-700">No location readings waiting</span>
                  )}
                </div>
                {locationState.syncMessage && (
                  <p role="status" className="mt-1.5 text-xs text-amber-900">{locationState.syncMessage}</p>
                )}
                {locationState.quarantinedCount > 0 && (
                  <p role="status" className="mt-1.5 text-xs text-rose-800">
                    {locationState.quarantinedCount} location readings from a trip the server could not accept are kept on this device for up to 7 days.
                  </p>
                )}
              </div>
            </div>

            {/* Simulated Offline Toggle for Demo Testing (Dev only) */}
            {!import.meta.env.PROD && (
              <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {locationState.isSimulatedOffline ? (
                    <WifiOff className="w-4 h-4 text-amber-700" />
                  ) : (
                    <Wifi className="w-4 h-4 text-emerald-700" />
                  )}
                  <div>
                    <span className="font-bold text-amber-900">Dev Offline Simulator: </span>
                    <span className="text-amber-800">
                      {locationState.isSimulatedOffline
                        ? 'Simulated Disconnect active. Storing in local queue.'
                        : 'Live online sync mode.'}
                    </span>
                  </div>
                </div>
                <button
                  id="toggle-offline-simulator"
                  onClick={() => toggleSimulatedOffline(!locationState.isSimulatedOffline)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs cursor-pointer shrink-0 ml-2"
                >
                  {locationState.isSimulatedOffline ? 'Restore Network' : 'Simulate Offline'}
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Driver Assigned Route & Live Bus Map */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {activeTrip ? 'Trip route and device position' : 'Assigned Route & Stops'}
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            {assignedRoute.stops?.length || 0} stops
          </span>
        </div>
        <MapView center={[currentCollege.centerLocation.lat, currentCollege.centerLocation.lng]} zoom={currentCollege.defaultZoom}
          buses={[{
            ...assignedBus,
            lastLocation: locationState.lastLocation || assignedBus.lastLocation,
            status: activeTrip ? 'ACTIVE' : 'IDLE',
            currentStopId: activeTrip?.currentStopId || assignedBus.currentStopId,
            nextStopId: activeTrip?.nextStopId || assignedBus.nextStopId,
            completedStopIds: activeTrip?.completedStopIds || assignedBus.completedStopIds || [],
          }]}
          routes={[assignedRoute]}
          selectedRouteId={assignedRoute.id}
          driverLocation={
            locationState.lastLocation
              ? {
                  lat: locationState.lastLocation.lat,
                  lng: locationState.lastLocation.lng,
                  heading: locationState.lastLocation.heading ?? undefined,
                  accuracy: locationState.lastLocation.accuracy ?? undefined,
                }
              : undefined
          }
          heightClass={activeTrip ? "h-[260px] sm:h-[300px]" : "h-[200px] sm:h-[240px]"}
        />
      </div>

      {/* Tactile Passenger Occupancy Control */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Passenger Occupancy</h3>
              <p className="text-xs text-slate-500">Fast one-tap seat tracking</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xl font-black text-slate-900 font-mono">
              {occupancy}
            </span>
            <span className="text-xs text-slate-500 font-bold"> / {capacity}</span>
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-200 ${
              occupancyPercent >= 90
                ? 'bg-rose-500'
                : occupancyPercent >= 65
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${occupancyPercent}%` }}
          />
        </div>

        {/* Large Touch-friendly Quick Buttons (Task 3.2: Mobile Touch Targets) */}
        <div className="grid grid-cols-4 gap-2 pt-2">
          <button
            id="occupancy-minus-5"
            disabled={!activeTrip || tripControlsLocked || occupancy <= 0}
            onClick={() => handleOccupancyChange(-5)}
            className="h-14 sm:h-16 min-h-[56px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 shadow-xs flex items-center justify-center"
          >
            -5
          </button>
          <button
            id="occupancy-minus-1"
            disabled={!activeTrip || tripControlsLocked || occupancy <= 0}
            onClick={() => handleOccupancyChange(-1)}
            className="h-14 sm:h-16 min-h-[56px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1 shadow-xs"
          >
            <Minus className="w-4 h-4" /> 1
          </button>
          <button
            id="occupancy-plus-1"
            disabled={!activeTrip || tripControlsLocked || occupancy >= capacity}
            onClick={() => handleOccupancyChange(1)}
            className="h-14 sm:h-16 min-h-[56px] bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1 shadow-xs"
          >
            <Plus className="w-4 h-4" /> 1
          </button>
          <button
            id="occupancy-plus-5"
            disabled={!activeTrip || tripControlsLocked || occupancy >= capacity}
            onClick={() => handleOccupancyChange(5)}
            className="h-14 sm:h-16 min-h-[56px] bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 shadow-xs flex items-center justify-center"
          >
            +5
          </button>
        </div>
      </div>

      {/* Emergency Alert Section */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-rose-950">Safety Incident & Emergency Dispatch</h3>
              <p className="text-xs text-rose-700">
                Immediately broadcasts alarm to campus security & transit dispatch
              </p>
            </div>
          </div>

          <button
            id="driver-emergency-button"
            onClick={() => setShowEmergencyModal(true)}
            disabled={!canStartEmergencySubmission(emergency)}
            className="w-full sm:w-auto min-h-[50px] px-5 py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2 shrink-0"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>TRIGGER EMERGENCY</span>
          </button>
        </div>

        {emergencyNotice && (
          <div role="status" aria-live="polite" className="mt-3 p-3 bg-white rounded-xl border border-rose-300 text-xs text-rose-800 flex flex-wrap items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${emergencyNotice.tone === 'success' ? 'text-emerald-600' : emergencyNotice.tone === 'error' ? 'text-rose-700' : 'text-amber-700'}`} aria-hidden="true" />
            <span className="font-semibold">{emergencyNotice.title}</span>
            <span className="basis-full">{emergencyNotice.detail}</span>
            {emergency.kind === 'UNCERTAIN' && (
              <>
              <button type="button" onClick={() => void reconcileEmergency(emergency.attempt)}
                className="min-h-11 px-3 text-xs font-semibold text-blue-700 underline">
                Check status
              </button>
              <button type="button" onClick={() => void submitEmergency(emergency.attempt, true)}
                className="min-h-11 px-3 text-xs font-semibold text-blue-700 underline">
                Retry same alert
              </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Start Trip Confirmation Modal */}
      <Modal
        isOpen={showStartTripModal}
        onClose={() => setShowStartTripModal(false)}
        title="Confirm Trip Assignment"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div>
              <strong>Vehicle:</strong> {assignedBus.busNumber} ({assignedBus.model})
            </div>
            <div>
              <strong>Route:</strong> {assignedRoute.code} — {assignedRoute.name}
            </div>
            <div>
              <strong>GPS Source:</strong>{' '}
              Device location
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Please verify you have mounted your device securely on the dashboard before engaging the
            transmission.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowStartTripModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="confirm-start-trip-btn"
              onClick={handleStartTrip}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              Start Tracking Now
            </button>
          </div>
        </div>
      </Modal>

      {/* End Trip Confirmation */}
      <ConfirmDialog
        isOpen={showEndTripConfirm}
        onClose={() => setShowEndTripConfirm(false)}
        onConfirm={handleEndTrip}
        title="End Campus Trip?"
        message="GPS tracking will stop. Queued location readings will sync when a connection is available."
        confirmLabel="End Trip"
        cancelLabel="Keep Running"
      />

      {/* Emergency Trigger Modal */}
      <Modal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        title="Report Urgent Incident"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Select the nature of the incident to alert campus dispatch immediately:
          </p>
          <select
            value={emergencyReason}
            onChange={(e) => setEmergencyReason(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          >
            <option value="Mechanical breakdown / safe curb stop">Mechanical breakdown / safe curb stop</option>
            <option value="Medical emergency on board">Medical emergency on board</option>
            <option value="Traffic collision / route obstruction">Traffic collision / route obstruction</option>
            <option value="Severe disruptive behavior / security request">Severe disruptive behavior / security request</option>
          </select>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowEmergencyModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="confirm-emergency-btn" disabled={!canStartEmergencySubmission(emergency)}
              onClick={handleSendEmergency}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              Send emergency alert
            </button>
          </div>
        </div>
      </Modal>

      {/* Trip Completed Summary Modal */}
      {tripSummary && (
        <Modal
          isOpen={!!tripSummary}
          onClose={() => setTripSummary(null)}
          title="Trip Summary & Debrief"
        >
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Trip Successfully Completed</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 text-slate-700">
                <div>
                  <span className="text-slate-500">Logged Pings:</span>{' '}
                  <strong>{tripSummary.totalLocationsLogged ?? 'Unavailable'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Vehicle:</span>{' '}
                  <strong>{assignedBus.busNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Route:</span>{' '}
                  <strong>{assignedRoute.code}</strong>
                </div>
              </div>
            </div>
            <button
              onClick={() => setTripSummary(null)}
              className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Dismiss & Return to Ready
            </button>
          </div>
        </Modal>
      )}

      {/* Driver GPS Permission Walkthrough Modal (Task 3.1) */}
      <Modal
        isOpen={showGpsHelpModal}
        onClose={() => setShowGpsHelpModal(false)}
        title="Driver Device GPS Setup Guide"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Live bus telemetry relies on your device&apos;s GPS sensor to calculate student ETAs and broadcast real-time transit positions.
          </p>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
            <div className="font-bold text-blue-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Mobile Browser Setup</span>
            </div>
            <div className="space-y-2 text-slate-700">
              <div>
                <strong className="text-slate-900">Apple iOS (Safari):</strong>
                <ol className="list-decimal pl-5 mt-0.5 space-y-0.5">
                  <li>Open iOS <strong>Settings</strong> &gt; <strong>Privacy &amp; Security</strong> &gt; <strong>Location Services</strong></li>
                  <li>Ensure <strong>Location Services</strong> is switched <strong>On</strong></li>
                  <li>Scroll to <strong>Safari Websites</strong> &gt; choose <strong>While Using the App</strong> (with Precise Location enabled)</li>
                </ol>
              </div>
              <div>
                <strong className="text-slate-900">Android (Chrome):</strong>
                <ol className="list-decimal pl-5 mt-0.5 space-y-0.5">
                  <li>Tap the <strong>tune / lock icon</strong> left of the URL in the address bar</li>
                  <li>Tap <strong>Permissions</strong> &gt; <strong>Location</strong> &gt; select <strong>Allow</strong></li>
                  <li>Ensure Android device <strong>High Accuracy Location</strong> is toggled on</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <strong className="text-slate-800">Desktop / Laptop Chrome or Firefox:</strong>
            <p className="text-slate-600">
              Click the lock/settings icon next to the URL address bar and set <strong>Location</strong> to <strong>Allow</strong>, then retry GPS.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={retryGps}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Radio className="w-4 h-4" />
              <span>Retry GPS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGpsHelpModal(false)}
              className="w-full sm:w-auto px-4 py-2 text-slate-600 hover:bg-slate-100 font-semibold rounded-xl cursor-pointer text-center"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
