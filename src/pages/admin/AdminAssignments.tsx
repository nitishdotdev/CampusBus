import React, { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { apiClient } from '../../services/apiClient';
import { socketService } from '../../services/socketService';
import { adminV1 } from '../../services/v1/admin';
import { busesV1 } from '../../services/v1/buses';
import { routesV1 } from '../../services/v1/routes';
import { Modal, ConfirmDialog } from '../../components/common/Modals';
import { EmptyState } from '../../components/common/States';
import {
  Link2,
  Plus,
  Bus as BusIcon,
  User,
  Route as RouteIcon,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Search,
} from 'lucide-react';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

interface AssignmentItem {
  id: string;
  busId: string;
  busNumber: string;
  plateNumber: string;
  capacity: number;
  driverId: string | null;
  driverName: string;
  driverPhone: string | null;
  driverCdl: string | null;
  routeId: string | null;
  routeName: string | null;
  routeCode: string | null;
  routeColor: string;
  status: 'ASSIGNED' | 'ACTIVE_TRIP' | 'MAINTENANCE';
  activeTripId: string | null;
  updatedAt?: string;
}

interface DirectoryDriver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  cdlNumber?: string;
  status: string;
  assignedBusNumber?: string | null;
}

export const AdminAssignments: React.FC = () => {
  const { currentCollege, buses, routes } = useApp();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [drivers, setDrivers] = useState<DirectoryDriver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [unassigningBusId, setUnassigningBusId] = useState<string | null>(null);

  // Form state
  const [selectedBusId, setSelectedBusId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [shift, setShift] = useState('Morning Peak');

  const fetchAssignments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (USE_V1) {
        const [busPage, driverPage, routePage] = await Promise.all([
          busesV1.list(),
          adminV1.users.list({ role: 'DRIVER', pageSize: 100 }),
          routesV1.list(),
        ]);
        const driverById = new Map(driverPage.items.map((d) => [d.id, d]));
        const routeById = new Map(routePage.items.map((r) => [r.id, r]));
        setAssignments(busPage.items.map((b) => {
          const driver = b.driverId ? driverById.get(b.driverId) : undefined;
          const route = b.routeId ? routeById.get(b.routeId) : undefined;
          return {
            id: b.id,
            busId: b.id,
            busNumber: b.number,
            plateNumber: '',
            capacity: b.capacity,
            driverId: b.driverId ?? null,
            driverName: driver?.name || 'Unassigned',
            driverPhone: driver?.phone ?? null,
            driverCdl: null,
            routeId: b.routeId ?? null,
            routeName: route?.name ?? null,
            routeCode: route?.code ?? null,
            routeColor: route?.color || '#2563EB',
            status: b.status === 'MAINTENANCE' ? 'MAINTENANCE' : b.driverId ? 'ASSIGNED' : 'ASSIGNED',
            activeTripId: null,
          } as AssignmentItem;
        }));
        setDrivers(driverPage.items.filter((d) => d.status === 'ACTIVE').map((d) => ({
          id: d.id,
          name: d.name,
          email: d.email,
          phone: d.phone ?? undefined,
          status: d.status,
        })));
        return;
      }
      const [assignmentData, driverData] = await Promise.all([
        apiClient.get<AssignmentItem[]>('/api/assignments'),
        apiClient.get<DirectoryDriver[]>('/api/users?role=DRIVER'),
      ]);
      setAssignments(assignmentData || []);
      setDrivers((driverData || []).filter((d) => d.status === 'ACTIVE'));
    } catch (err: any) {
      setError(err?.message || 'Failed to load assignments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();

    // Listen for realtime bus or trip status changes
    const unsubBus = socketService.on('bus:updated', () => fetchAssignments());
    const unsubTripStart = socketService.on('trip:started', () => fetchAssignments());
    const unsubTripEnd = socketService.on('trip:ended', () => fetchAssignments());

    return () => {
      unsubBus();
      unsubTripStart();
      unsubTripEnd();
    };
  }, []);

  const openAssignModal = (prefillBusId?: string) => {
    setModalError(null);
    if (prefillBusId) {
      const existing = assignments.find((a) => a.busId === prefillBusId);
      setSelectedBusId(prefillBusId);
      setSelectedDriverId(existing?.driverId || drivers[0]?.id || '');
      setSelectedRouteId(existing?.routeId || routes[0]?.id || '');
    } else {
      setSelectedBusId(buses[0]?.id || '');
      setSelectedDriverId(drivers[0]?.id || '');
      setSelectedRouteId(routes[0]?.id || '');
    }
    setIsModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!selectedBusId || !selectedDriverId || !selectedRouteId) {
      setModalError('Please select a bus, a driver, and a route.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (USE_V1) {
        await busesV1.assignDriver(selectedBusId, selectedDriverId);
        await busesV1.assignRoute(selectedBusId, selectedRouteId);
      } else {
        await apiClient.post('/api/assignments', {
          busId: selectedBusId,
          driverId: selectedDriverId,
          routeId: selectedRouteId,
          shift,
        });
      }

      setSuccessNotice('Driver assigned successfully. Terminal will immediately reflect this assignment.');
      setTimeout(() => setSuccessNotice(null), 4000);
      setIsModalOpen(false);
      await fetchAssignments();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to establish assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnassign = async () => {
    if (!unassigningBusId) return;
    try {
      if (USE_V1) {
        await busesV1.assignDriver(unassigningBusId, null);
        await busesV1.assignRoute(unassigningBusId, null);
      } else {
        await apiClient.delete(`/api/assignments/${unassigningBusId}`);
      }
      setSuccessNotice('Assignment cleared successfully.');
      setTimeout(() => setSuccessNotice(null), 3000);
      setUnassigningBusId(null);
      await fetchAssignments();
    } catch (err: any) {
      alert(err?.message || 'Failed to unassign vehicle.');
      setUnassigningBusId(null);
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      a.busNumber.toLowerCase().includes(term) ||
      a.driverName.toLowerCase().includes(term) ||
      (a.routeCode && a.routeCode.toLowerCase().includes(term)) ||
      (a.routeName && a.routeName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Vehicle &amp; Driver Assignments
          </h2>
          <p className="text-xs text-slate-500">
            Connect verified drivers, campus buses, and operating transit lines
          </p>
        </div>

        <button
          onClick={() => openAssignModal()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Assignment</span>
        </button>
      </div>

      {successNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by bus number, driver name, route..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500">
          {filteredAssignments.length} assigned bus{filteredAssignments.length !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span>Loading active assignments...</span>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No active assignments"
              description="No buses currently have assigned drivers and routes. Create an assignment to dispatch a driver."
              icon={Link2}
              actionLabel="Create Assignment"
              onAction={() => openAssignModal()}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Bus</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Assigned Route</th>
                  <th className="py-3 px-4">Duty Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssignments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          <BusIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div>{item.busNumber}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{item.plateNumber}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                          {item.driverName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{item.driverName}</div>
                          {item.driverCdl && (
                            <div className="text-[10px] text-slate-400 font-mono">{item.driverCdl}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.routeCode ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.routeColor }}
                          />
                          <div>
                            <span className="font-bold text-slate-900">{item.routeCode}</span>
                            <span className="text-[11px] text-slate-500 ml-1.5">{item.routeName}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No route assigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.status === 'ACTIVE_TRIP'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.status === 'MAINTENANCE'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.status === 'ACTIVE_TRIP'
                              ? 'bg-emerald-500 animate-pulse'
                              : item.status === 'MAINTENANCE'
                              ? 'bg-rose-500'
                              : 'bg-blue-500'
                          }`}
                        />
                        {item.status === 'ACTIVE_TRIP'
                          ? 'In Active Trip'
                          : item.status === 'MAINTENANCE'
                          ? 'Under Maintenance'
                          : 'Assigned / Idle'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openAssignModal(item.busId)}
                          disabled={item.status === 'ACTIVE_TRIP'}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={item.status === 'ACTIVE_TRIP' ? 'Cannot reassign during active trip' : 'Edit assignment'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setUnassigningBusId(item.busId)}
                          disabled={item.status === 'ACTIVE_TRIP'}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={item.status === 'ACTIVE_TRIP' ? 'Cannot unassign during active trip' : 'Unassign bus'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Assignment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Connect Driver, Vehicle & Route"
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4 text-xs">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Select Campus Bus</label>
            <select
              value={selectedBusId}
              onChange={(e) => setSelectedBusId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="" disabled>Choose a bus from fleet...</option>
              {buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.busNumber} — {b.model} ({b.plateNumber})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Select Driver</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="" disabled>Choose an active certified driver...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.cdlNumber ? `(${d.cdlNumber})` : ''} — {d.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Operating Transit Route</label>
            <select
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="" disabled>Choose a transit line...</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name} ({r.stops.length} stops)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Shift / Schedule Plan</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
            >
              <option value="Morning Peak (07:00 - 12:00)">Morning Peak (07:00 - 12:00)</option>
              <option value="Midday Regular (12:00 - 17:00)">Midday Regular (12:00 - 17:00)</option>
              <option value="Evening Peak (17:00 - 22:00)">Evening Peak (17:00 - 22:00)</option>
              <option value="Night Owl Shuttle (22:00 - 02:00)">Night Owl Shuttle (22:00 - 02:00)</option>
              <option value="Full Day Shift">Full Day Shift</option>
            </select>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Assignment</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unassign Confirm Dialog */}
      <ConfirmDialog
        isOpen={unassigningBusId !== null}
        onClose={() => setUnassigningBusId(null)}
        onConfirm={handleUnassign}
        title="Remove Vehicle Assignment"
        message="Are you sure you want to unassign this vehicle and driver? The driver will see an unassigned state and cannot start trips on this bus until assigned again."
        confirmLabel="Unassign Bus"
        isDangerous
      />
    </div>
  );
};
