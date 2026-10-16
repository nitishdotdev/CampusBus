import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Edit2, Loader, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface Schedule {
  id: string;
  bus_id: string;
  route_id: string;
  departure_time: string;
  arrival_time?: string;
  operating_days: string[];
  status: string;
}

interface Bus {
  id: string;
  bus_number: string;
}

interface Route {
  id: string;
  name: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function AdminSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    busId: '',
    routeId: '',
    departureTime: '',
    arrivalTime: '',
    operatingDays: [] as string[],
  });

  // Fetch data from real API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [schedulesRes, busesRes, routesRes] = await Promise.all([
          apiClient.get<any[]>('/api/schedules'),
          apiClient.get<any[]>('/api/buses'),
          apiClient.get<any[]>('/api/routes'),
        ]);

        setSchedules(schedulesRes || []);
        setBuses(busesRes || []);
        setRoutes(routesRes || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleDayToggle = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      operatingDays: prev.operatingDays.includes(day)
        ? prev.operatingDays.filter((d) => d !== day)
        : [...prev.operatingDays, day],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.busId || !formData.routeId || !formData.departureTime || formData.operatingDays.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingId) {
        // Update existing
        await apiClient.put<any[]>(`/api/schedules/${editingId}`, {
          departureTime: formData.departureTime,
          arrivalTime: formData.arrivalTime,
          operatingDays: formData.operatingDays,
        });
      } else {
        // Create new
        await apiClient.post<any[]>('/api/schedules', {
          busId: formData.busId,
          routeId: formData.routeId,
          departureTime: formData.departureTime,
          arrivalTime: formData.arrivalTime,
          operatingDays: formData.operatingDays,
        });
      }

      // Refresh list
      const response = await apiClient.get<any[]>('/api/schedules');
      setSchedules(response || []);

      // Reset form
      setFormData({ busId: '', routeId: '', departureTime: '', arrivalTime: '', operatingDays: [] });
      setEditingId(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to save schedule');
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      busId: schedule.bus_id,
      routeId: schedule.route_id,
      departureTime: schedule.departure_time,
      arrivalTime: schedule.arrival_time || '',
      operatingDays: schedule.operating_days,
    });
    setEditingId(schedule.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await apiClient.delete<any[]>(`/api/schedules/${id}`);
      setSchedules(schedules.filter((s) => s.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete schedule');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">Bus Schedules</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {editingId ? 'Edit Schedule' : 'Create Schedule'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Bus *</label>
                  <select
                    value={formData.busId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, busId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={editingId ? true : false}
                  >
                    <option value="">Select Bus</option>
                    {buses.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.bus_number}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Route *</label>
                  <select
                    value={formData.routeId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, routeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={editingId ? true : false}
                  >
                    <option value="">Select Route</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Departure Time *</label>
                  <input
                    type="time"
                    value={formData.departureTime}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departureTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Arrival Time</label>
                  <input
                    type="time"
                    value={formData.arrivalTime}
                    onChange={(e) => setFormData((prev) => ({ ...prev, arrivalTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Operating Days *</label>
                  <div className="space-y-2">
                    {DAYS.map((day) => (
                      <label key={day} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.operatingDays.includes(day)}
                          onChange={() => handleDayToggle(day)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {editingId ? 'Update' : 'Add'} Schedule
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ busId: '', routeId: '', departureTime: '', arrivalTime: '', operatingDays: [] });
                    }}
                    className="w-full bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h2 className="text-lg font-semibold text-gray-800">
                  Schedules ({schedules.length})
                </h2>
              </div>

              {loading ? (
                <div className="p-8 text-center">
                  <Loader className="w-12 h-12 text-blue-400 mx-auto animate-spin" />
                </div>
              ) : schedules.length > 0 ? (
                <div className="divide-y">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="p-6 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            Route: {schedule.route_id}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Bus: {buses.find((b) => b.id === schedule.bus_id)?.bus_number}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(schedule)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                        <div>
                          <p className="text-gray-600">Depart</p>
                          <p className="font-semibold">{schedule.departure_time}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Arrive</p>
                          <p className="font-semibold">{schedule.arrival_time || '—'}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {schedule.operating_days.map((day) => (
                          <span key={day} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {day.slice(0, 3)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No schedules created yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSchedules;
