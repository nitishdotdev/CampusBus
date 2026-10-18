import React, { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { apiClient } from '../../services/apiClient';
import { tripService } from '../../services/tripService';
import { adminService } from '../../services/adminService';
import { tripsV1 } from '../../services/v1/trips';
import { alertsV1 } from '../../services/v1/notifications';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';
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
} from 'lucide-react';

export const DriverDashboard: React.FC = () => {
  const {
    currentUser,
    activeTrip,
    buses,
    routes,
    locationState,
    toggleSimulatedOffline,
  } = useApp();

  const [assignment, setAssignment] = useState<any>(null);
  const [tripError, setTripError] = useState<string | null>(null);

  // Fetch driver assignments from backend API
  useEffect(() => {
    let isMounted = true;
    const loadAssignment = async () => {
      try {
        const res = await apiClient.get<any>('/api/driver/assignments');
        if (isMounted && res?.assignment) {
          setAssignment(res.assignment);
        }
      } catch (err) {
        console.warn('Could not load driver assignment:', err);
      }
    };
    loadAssignment();
    return () => {
      isMounted = false;
    };
  }, [activeTrip]);

  // Determine driver's assigned bus and route dynamically
  const assignedBus =
    buses.find((b) => b.id === activeTrip?.busId) ||
    (assignment?.busId ? buses.find((b) => b.id === assignment.busId) : null) ||
    buses.find((b) => b.currentDriverId === currentUser?.id) ||
    buses[0];

  const assignedRoute =
    routes.find((r) => r.id === (activeTrip?.routeId || assignment?.routeId || assignedBus?.currentRouteId)) ||
    routes[0];

  const [useSimulatedGps, setUseSimulatedGps] = useState(false);
  const [showStartTripModal, setShowStartTripModal] = useState(false);
  const [showEndTripConfirm, setShowEndTripConfirm] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showGpsHelpModal, setShowGpsHelpModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('Mechanical issue / curb stop');
  const [emergencySent, setEmergencySent] = useState(false);
  const [tripSummary, setTripSummary] = useState<any>(null);

  // Auto-prompt GPS permission walkthrough if permission required
  useEffect(() => {
    if (locationState.gpsStatus === 'GPS_PERMISSION_REQUIRED') {
      setShowGpsHelpModal(true);
    }
  }, [locationState.gpsStatus]);

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
      setTripElapsedMins(Math.max(1, Math.floor((now - start) / (60 * 1000))));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 30000);
    return () => clearInterval(interval);
  }, [activeTrip]);

  const handleStartTrip = async () => {
    setShowStartTripModal(false);
    setTripError(null);
    try {
      if (USE_V1) {
        await tripsV1.start(assignedBus.id);
      } else {
        await tripService.startTrip(
          assignedBus.id,
          currentUser?.id || 'driver_marcus',
          assignedRoute.id,
          currentUser?.collegeId || 'college_apex',
          useSimulatedGps
        );
      }
    } catch (err: any) {
      setTripError(err.message || err.data?.error || 'Vehicle or driver conflict: Cannot start trip while another is active.');
    }
  };

  const handleEndTrip = async () => {
    setShowEndTripConfirm(false);
    if (USE_V1 && activeTrip?.id) {
      await tripsV1.end(activeTrip.id);
      setTripSummary({ message: 'Trip ended.' } as any);
    } else {
      const summary = await tripService.endTrip();
      setTripSummary(summary);
    }
  };

  const handleOccupancyChange = (delta: number) => {
    tripService.updateOccupancy(delta, false);
  };

  const handleSendEmergency = () => {
    if (!assignedBus || !assignedRoute) return;

    adminService.triggerEmergencyAlert({
      collegeId: currentUser?.collegeId || 'college_apex',
      tripId: activeTrip?.id || 'manual_' + Date.now(),
      busId: assignedBus.id,
      busNumber: assignedBus.busNumber,
      driverId: currentUser?.id || 'driver_marcus',
      driverName: currentUser?.name || 'Marcus Vance',
      routeId: assignedRoute.id,
      routeName: assignedRoute.name,
      location: locationState.lastLocation || {
        lat: assignedBus.lastLocation.lat,
        lng: assignedBus.lastLocation.lng,
      },
      reason: emergencyReason,
    });

    setEmergencySent(true);
    setShowEmergencyModal(false);
  };

  const occupancy = activeTrip ? activeTrip.currentOccupancy : assignedBus.currentOccupancy;
  const capacity = assignedBus.capacity || 45;
  const occupancyPercent = Math.min(100, Math.round((occupancy / capacity) * 100));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
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
                  {currentUser?.name || 'Marcus Vance'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  CDL ON-DUTY
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Assigned: <strong className="text-slate-800">{assignedBus.busNumber}</strong> ({assignedBus.model.split(' ')[0]}) • Route{' '}
                <strong className="text-slate-800">{assignedRoute.code}</strong>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                activeTrip
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {activeTrip ? 'TRIP ACTIVE' : 'TERMINAL READY'}
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

            {/* GPS Mode Selection (Real vs Demo Simulated) */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl max-w-md mx-auto text-left text-xs">
              <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-600" />
                Location Source
              </div>
              <label className="flex items-center gap-2 cursor-pointer mt-2 text-slate-700">
                <input
                  type="radio"
                  name="gpsMode"
                  checked={!useSimulatedGps}
                  onChange={() => setUseSimulatedGps(false)}
                  className="text-blue-600"
                />
                <span className="font-medium text-slate-900">Real Browser GPS (navigator.geolocation - Device GPS)</span>
              </label>
              {!import.meta.env.PROD && (
                <label className="flex items-center gap-2 cursor-pointer mt-1.5 text-slate-700">
                  <input
                    type="radio"
                    name="gpsMode"
                    checked={useSimulatedGps}
                    onChange={() => setUseSimulatedGps(true)}
                    className="text-blue-600"
                  />
                  <span className="font-medium text-amber-900">
                    Simulated Demo GPS (Development Mode)
                  </span>
                </label>
              )}
            </div>

            <button
              id="start-trip-button"
              onClick={() => setShowStartTripModal(true)}
              className="w-full sm:w-80 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>START CAMPUS TRIP</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Live Trip In Progress
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {assignedRoute.code}: {assignedRoute.name}
                </h3>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 font-medium">Trip Duration</div>
                <div className="text-lg font-bold text-slate-900 font-mono">
                  {tripElapsedMins} min
                </div>
              </div>
            </div>

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
                  lastUpdateText={locationState.lastLocation ? '3s ago' : undefined}
                />
                <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
                  {locationState.lastLocation
                    ? `${locationState.lastLocation.lat.toFixed(5)}, ${locationState.lastLocation.lng.toFixed(5)}`
                    : 'Awaiting first coordinates...'}
                </div>
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
                      {locationState.queuedCount} location pings queued offline
                    </span>
                  ) : (
                    <span className="text-emerald-700">All coordinates synced to server</span>
                  )}
                </div>
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

            {/* End Trip Button */}
            <button
              id="end-trip-button"
              onClick={() => setShowEndTripConfirm(true)}
              className="w-full min-h-[52px] py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Square className="w-4 h-4 fill-current text-rose-400" />
              <span>END TRIP & RETURN TO TERMINAL</span>
            </button>
          </div>
        )}
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
            disabled={occupancy <= 0}
            onClick={() => handleOccupancyChange(-5)}
            className="h-14 sm:h-16 min-h-[56px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 shadow-xs flex items-center justify-center"
          >
            -5
          </button>
          <button
            id="occupancy-minus-1"
            disabled={occupancy <= 0}
            onClick={() => handleOccupancyChange(-1)}
            className="h-14 sm:h-16 min-h-[56px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1 shadow-xs"
          >
            <Minus className="w-4 h-4" /> 1
          </button>
          <button
            id="occupancy-plus-1"
            disabled={occupancy >= capacity}
            onClick={() => handleOccupancyChange(1)}
            className="h-14 sm:h-16 min-h-[56px] bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800 font-black text-base rounded-2xl transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1 shadow-xs"
          >
            <Plus className="w-4 h-4" /> 1
          </button>
          <button
            id="occupancy-plus-5"
            disabled={occupancy >= capacity}
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
            className="w-full sm:w-auto min-h-[50px] px-5 py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2 shrink-0"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>TRIGGER EMERGENCY</span>
          </button>
        </div>

        {emergencySent && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-rose-300 text-xs text-rose-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Emergency alert acknowledged by campus operations. Safety team alerted at{' '}
              {new Date().toLocaleTimeString()}.
            </span>
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
              {useSimulatedGps ? 'Simulated Demo Coordinates' : 'Browser Geolocation API (Device GPS)'}
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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
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
        message="This will stop GPS tracking, flush any pending offline location pings, and set vehicle status back to Idle."
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
              id="confirm-emergency-btn"
              onClick={handleSendEmergency}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              Broadcast Emergency Signal
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
                  <span className="text-slate-500">Distance Covered:</span>{' '}
                  <strong>{tripSummary.distanceCoveredKm} km</strong>
                </div>
                <div>
                  <span className="text-slate-500">Logged Pings:</span>{' '}
                  <strong>{tripSummary.syncedLocationsCount}</strong>
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
              Click the lock/settings icon next to the URL address bar and change <strong>Location</strong> from &ldquo;Ask&rdquo; or &ldquo;Block&rdquo; to <strong>Allow</strong>, then reload.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if ('geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    () => {
                      setShowGpsHelpModal(false);
                    },
                    (err) => {
                      console.warn('Geolocation permission error:', err);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Radio className="w-4 h-4" />
              <span>Prompt Device GPS Permission</span>
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
