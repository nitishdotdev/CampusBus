import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Edit2, Loader, AlertCircle } from 'lucide-react';
import { busesV1 } from '../../services/v1/buses';
import { routesV1 } from '../../services/v1/routes';
import { allPages } from '../../services/v1/pages';
import { schedulesV1, type ScheduleDirection } from '../../services/v1/notifications';
import { dayNameToIndex, v1ScheduleToUi, type UiSchedule } from '../../services/v1/adapters';

type Schedule = UiSchedule;

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    busId: '',
    routeId: '',
    departureTime: '',
    arrivalTime: '',
    direction: 'TO_CAMPUS' as ScheduleDirection,
    operatingDays: [] as string[],
  });

  // Fetch data from real API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [loadedSchedules, loadedBuses, loadedRoutes] = await Promise.all([
          allPages(page => schedulesV1.list(undefined, undefined, undefined, page)),
          allPages(page => busesV1.list(page, 100)),
          allPages(page => routesV1.list(page, 100)),
        ]);

        setSchedules(loadedSchedules.map(v1ScheduleToUi));
        setBuses(loadedBuses.map((b) => ({ id: b.id, bus_number: b.number })));
        setRoutes(loadedRoutes.map((r) => ({ id: r.id, name: r.name })));
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
    if (saving) return;
    setError(null);

    if (!formData.busId || !formData.routeId || !formData.departureTime || formData.operatingDays.length === 0) {
      setError('Select a bus, route, departure time and at least one operating day.');
      return;
    }

    setSaving(true);
    try {
      const body = {
        busId: formData.busId, routeId: formData.routeId, direction: formData.direction,
        daysOfWeek: formData.operatingDays.map(dayNameToIndex),
        departTime: formData.departureTime, arriveTime: formData.arrivalTime || null,
      };
      if (editingId) {
        const record = v1ScheduleToUi(await schedulesV1.update(editingId, body));
        setSchedules(previous => previous.map(item => item.id === editingId ? record : item));
      } else {
        const record = v1ScheduleToUi(await schedulesV1.create({ ...body, active: true }));
        setSchedules(previous => [...previous, record]);
      }
      setFormData({ busId: '', routeId: '', departureTime: '', arrivalTime: '', direction: 'TO_CAMPUS', operatingDays: [] });
      setEditingId(null);
    } catch {
      setError('Could not save the schedule. Check the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      busId: schedule.bus_id,
      routeId: schedule.route_id,
      departureTime: schedule.departure_time,
      arrivalTime: schedule.arrival_time || '',
      direction: schedule.direction,
      operatingDays: schedule.operating_days,
    });
    setEditingId(schedule.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await schedulesV1.delete(id);
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
                  <label htmlFor="schedule-bus" className="block text-sm font-semibold text-gray-700 mb-2">Bus *</label>
                  <select
                    id="schedule-bus" value={formData.busId}
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
                  <label htmlFor="schedule-route" className="block text-sm font-semibold text-gray-700 mb-2">Route *</label>
                  <select
                    id="schedule-route" value={formData.routeId}
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
                  <label htmlFor="schedule-departure" className="block text-sm font-semibold text-gray-700 mb-2">Departure Time *</label>
                  <input
                    type="time"
                    id="schedule-departure" value={formData.departureTime}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departureTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="schedule-arrival" className="block text-sm font-semibold text-gray-700 mb-2">Arrival Time</label>
                  <input
                    type="time"
                    id="schedule-arrival" value={formData.arrivalTime}
                    onChange={(e) => setFormData((prev) => ({ ...prev, arrivalTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <label className="block text-sm font-semibold text-gray-700">
                  Direction
                  <select value={formData.direction} onChange={event => setFormData(previous => ({ ...previous, direction: event.target.value as ScheduleDirection }))}
                    className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2">
                    <option value="TO_CAMPUS">To campus</option>
                    <option value="FROM_CAMPUS">From campus</option>
                  </select>
                </label>

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
                  type="submit" disabled={saving}
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
                      setFormData({ busId: '', routeId: '', departureTime: '', arrivalTime: '', direction: 'TO_CAMPUS', operatingDays: [] });
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
                            Route: {routes.find(route => route.id === schedule.route_id)?.name ?? 'Unavailable'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Bus: {buses.find((b) => b.id === schedule.bus_id)?.bus_number}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(schedule)} aria-label="Edit schedule"
                            className="min-h-11 min-w-11 p-2 text-blue-700 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule.id)} aria-label="Delete schedule"
                            className="min-h-11 min-w-11 p-2 text-red-700 hover:bg-red-50 rounded"
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
