import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, AlertCircle, Loader } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface Schedule {
  id: string;
  bus_id: string;
  route_id: string;
  departure_time: string;
  arrival_time?: string;
  operating_days: string[];
  status: string;
  notes?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function StudentSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);
  const [selectedRoute, setSelectedRoute] = useState<string>('');

  // Fetch real schedules from API
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (selectedRoute) params.append('routeId', selectedRoute);
        if (selectedDay) params.append('operatingDay', selectedDay);

        const response = await apiClient.get<any[]>(`/api/schedules?${params.toString()}`);
        setSchedules(response || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load schedules');
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [selectedDay, selectedRoute]);

  const routes = Array.from(new Set(schedules.map((s) => s.route_id)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">Bus Schedule</h1>
          </div>
          <p className="text-gray-600">View real-time departure schedules for your campus</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Day
              </label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by Route (Optional)
              </label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Routes</option>
                {routes.map((route) => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Loader className="w-12 h-12 text-blue-400 mx-auto animate-spin mb-3" />
            <p className="text-gray-600">Loading schedules...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Schedules List */}
        {!loading && !error && schedules.length > 0 && (
          <div className="space-y-4">
            {schedules
              .filter((s) => s.status === 'ACTIVE')
              .sort((a, b) => a.departure_time.localeCompare(b.departure_time))
              .map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-1">
                        Route: {schedule.route_id}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Bus: <span className="font-semibold">{schedule.bus_id}</span>
                      </p>
                      {schedule.notes && (
                        <p className="text-sm text-blue-600 mt-2">{schedule.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-xs text-gray-600">Depart</p>
                          <p className="text-lg font-semibold text-gray-800">
                            {schedule.departure_time}
                          </p>
                        </div>
                      </div>

                      {schedule.arrival_time && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-xs text-gray-600">Arrive</p>
                            <p className="text-lg font-semibold text-gray-800">
                              {schedule.arrival_time}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && schedules.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">
              No schedules available for {selectedDay}
              {selectedRoute && ` on Route ${selectedRoute}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentSchedules;
