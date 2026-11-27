import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { BusStatusBadge } from '../../components/common/StatusBadges';
import { SearchInput, FilterBar } from '../../components/common/Inputs';
import { Modal, ConfirmDialog } from '../../components/common/Modals';
import { busesV1, type V1Bus } from '../../services/v1/buses';

import {
  Bus as BusIcon,
  Plus,
  Search,
  Wrench,
  Trash2,
  Edit2,
  CheckCircle2,
  Users,
} from 'lucide-react';

export const AdminBuses: React.FC = () => {
  const { buses, routes, refreshData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingBusId, setDeletingBusId] = useState<string | null>(null);

  // New Bus form state
  const [busNumber, setBusNumber] = useState('');
  const [model, setModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState(45);
  const [assignedRouteId, setAssignedRouteId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const filteredBuses = buses.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
    if (
      searchTerm &&
      !b.busNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !b.model.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !b.plateNumber.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const mutate = async (operation: () => Promise<unknown>, after: () => void = () => {}) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await operation();
      after();
      await refreshData();
    } catch {
      setError('Could not save the vehicle change. Check the vehicle status and try again.');
    } finally {
      setPending(false);
    }
  };

  const handleAddBus = (event: React.FormEvent) => {
    event.preventDefault();
    void mutate(() => busesV1.create({
      number: busNumber.trim(), capacity, status: 'ACTIVE',
      model: model.trim() || undefined, plateNumber: plateNumber.trim() || undefined, routeId: assignedRouteId || undefined,
    }), () => {
      setIsAddModalOpen(false);
      setBusNumber('');
      setModel('');
      setPlateNumber('');
      setAssignedRouteId('');
    });
  };

  const handleStatusChange = (id: string, status: V1Bus['status']) =>
    mutate(() => busesV1.update(id, { status }));

  const handleDelete = () =>
    deletingBusId ? mutate(() => busesV1.delete(deletingBusId), () => setDeletingBusId(null)) : undefined;

  const filterOptions = [
    { id: 'ALL', label: 'All Fleet', count: buses.length },
    { id: 'ACTIVE', label: 'Active', count: buses.filter((b) => b.status === 'ACTIVE').length },
    { id: 'IDLE', label: 'Idle', count: buses.filter((b) => b.status === 'IDLE').length },
    {
      id: 'MAINTENANCE',
      label: 'Maintenance',
      count: buses.filter((b) => b.status === 'MAINTENANCE').length,
    },
    { id: 'OFFLINE', label: 'Offline', count: buses.filter((b) => b.status === 'OFFLINE').length },
  ];

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campus Bus Fleet Management</h2>
          <p className="text-xs text-slate-500">
            Maintain vehicle inventory, assign drivers, and regulate operational status
          </p>
        </div>

        <button
          id="add-new-bus-button"
          onClick={() => setIsAddModalOpen(true)}
          className="self-start sm:self-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Campus Bus</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <FilterBar
          filters={filterOptions}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
        <div className="w-full sm:w-64">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search bus number, model..."
          />
        </div>
      </div>

      {/* Bus Fleet Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Bus Identification</th>
                <th className="py-3 px-4">Operating Status</th>
                <th className="py-3 px-4">Assigned Line</th>
                <th className="py-3 px-4">Assigned Driver</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredBuses.map((bus) => {
                const route = routes.find((r) => r.id === bus.currentRouteId);
                return (
                  <tr key={bus.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                          <BusIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div>{bus.busNumber}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {bus.model} • {bus.plateNumber}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={bus.operationalStatus ?? 'ACTIVE'}
                        aria-label={`Operational status for ${bus.busNumber}`} disabled={pending || Boolean(bus.activeTripId)}
                        onChange={(e) => handleStatusChange(bus.id, e.target.value as V1Bus['status'])}
                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <option value="ACTIVE">{bus.activeTripId ? 'In service' : 'Idle · available'}</option>
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="OFFLINE">Out of service</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4 font-medium">
                      {route ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: route.color }}
                          />
                          <span>
                            {route.code} — {route.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Unassigned (Pool)</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {bus.driverName ? (
                        <span className="font-semibold text-slate-900">{bus.driverName}</span>
                      ) : (
                        <span className="text-slate-400 italic">No driver assigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold">
                      {bus.hasOccupancy ? `${bus.currentOccupancy} / ${bus.capacity} seats` : `${bus.capacity} seats`}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setDeletingBusId(bus.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove vehicle from fleet"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bus Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Campus Shuttle Vehicle"
      >
        <form onSubmit={handleAddBus} className="space-y-4">
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Bus Number / Asset Tag *
            </label>
            <input
              type="text"
              required
              value={busNumber}
              onChange={(e) => setBusNumber(e.target.value)}
              placeholder="e.g. BUS-106"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Model</label>
            <input aria-label="Vehicle model" value={model} onChange={e => setModel(e.target.value)} maxLength={80}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs" />

          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">License Plate</label>
              <input
                type="text"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="e.g. CAMPUS-106"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Passenger Capacity</label>
              <input
                type="number"
                min="1"
                max="200" required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Initial Assigned Route</label>
            <select
              value={assignedRouteId}
              onChange={(e) => setAssignedRouteId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <option value="">Unassigned (Reserve Fleet)</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={pending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
            >
              Add Vehicle to Fleet
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingBusId}
        onClose={() => setDeletingBusId(null)}
        onConfirm={handleDelete}
        title="Remove Vehicle from Fleet?"
        message="This will remove the bus record from the campus registry. Any active GPS tracks will be terminated."
        confirmLabel="Remove Bus"
        isDangerous
      />
    </div>
  );
};
