import React, { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { BusStatus } from '../../types';
import { SearchInput, FilterBar } from '../../components/common/Inputs';
import { Modal, ConfirmDialog } from '../../components/common/Modals';
import { adminService } from '../../services/adminService';
import { busService } from '../../services/busService';
import { apiClient } from '../../services/apiClient';
import { busesV1 } from '../../services/v1/buses';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';
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

interface DirectoryUser {
  id: string;
  name: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
}

export const AdminBuses: React.FC = () => {
  const { buses, routes, currentCollege } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingBusId, setDeletingBusId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DirectoryUser[]>([]);

  const [busNumber, setBusNumber] = useState('');
  const [model, setModel] = useState('Gillig Low Floor 40ft');
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState(45);
  const [assignedRouteId, setAssignedRouteId] = useState('');
  const [assignedDriverId, setAssignedDriverId] = useState('');

  useEffect(() => {
    apiClient.get<DirectoryUser[]>('/api/users?role=DRIVER')
      .then((data) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => setDrivers([]));
  }, []);

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

  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busNumber.trim()) return;
    if (USE_V1) {
      await busesV1.create({
        number: busNumber.trim(),
        capacity: Number(capacity) || 45,
        status: 'ACTIVE',
      });
    } else {
      const created = await adminService.addBus({
        collegeId: currentCollege.id,
        busNumber: busNumber.trim(),
        model,
        plateNumber: plateNumber.trim() || `CAMPUS-${Math.floor(1000 + Math.random() * 9000)}`,
        capacity: Number(capacity) || 45,
        status: 'IDLE',
        currentOccupancy: 0,
        currentRouteId: assignedRouteId || undefined,
        heading: 0,
        speedKmh: 0,
        gpsStatus: 'GPS_SEARCHING',
        networkStatus: 'NETWORK_ONLINE',
        etaConfidence: 'SCHEDULED',
      });
      if (assignedDriverId && created?.id) {
        await busService.updateBus(created.id, { currentDriverId: assignedDriverId } as any);
      }
    }
    setIsAddModalOpen(false);
    setBusNumber('');
    setPlateNumber('');
    setAssignedDriverId('');
  };

  const handleStatusChange = async (busId: string, status: BusStatus) => {
    if (USE_V1) {
      const v1Status = status === 'IDLE' ? 'OFFLINE' : status === 'ACTIVE' ? 'ACTIVE' : 'MAINTENANCE';
      await busesV1.update(busId, { status: v1Status });
    } else {
      adminService.updateBusStatus(busId, status);
    }
  };

  const handleDelete = async () => {
    if (!deletingBusId) return;
    if (USE_V1) {
      await busesV1.delete(deletingBusId);
    } else {
      adminService.deleteBus(deletingBusId);
    }
    setDeletingBusId(null);
  };

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
                        value={bus.status}
                        onChange={(e) => handleStatusChange(bus.id, e.target.value as BusStatus)}
                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="IDLE">IDLE</option>
                        <option value="MAINTENANCE">MAINTENANCE</option>
                        <option value="OFFLINE">OFFLINE</option>
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
                      <select
                        value={bus.currentDriverId || ''}
                        onChange={(e) => busService.updateBus(bus.id, { currentDriverId: e.target.value || null } as any)}
                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer min-h-11"
                        aria-label={`Assign driver for ${bus.busNumber}`}
                      >
                        <option value="">Unassigned</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold">
                      {bus.currentOccupancy} / {bus.capacity} seats
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
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <option value="Gillig Low Floor 40ft">Gillig Low Floor 40ft (Diesel-Electric)</option>
              <option value="Proterra ZX5 Electric">Proterra ZX5 Electric (Zero Emission)</option>
              <option value="Ford E-450 Campus Shuttle">Ford E-450 Cutaway (Short Campus Van)</option>
            </select>
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
                min="10"
                max="90"
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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Driver</label>
            <select
              value={assignedDriverId}
              onChange={(e) => setAssignedDriverId(e.target.value)}
              className="w-full min-h-11 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <option value="">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
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
              type="submit"
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
