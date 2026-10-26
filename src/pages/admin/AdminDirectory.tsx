import React, { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { SearchInput } from '../../components/common/Inputs';
import { apiClient } from '../../services/apiClient';
import {
  Bus,
  GraduationCap,
  Phone,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
  studentId?: string;
  cdlNumber?: string;
  phone?: string;
  status?: string;
  createdAt?: string;
}

export const AdminDirectory: React.FC = () => {
  const { buses } = useApp();
  const [tab, setTab] = useState<'DRIVERS' | 'STUDENTS'>('DRIVERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<DirectoryUser[]>('/api/users');
        if (mounted) setUsers(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load directory.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const drivers = users.filter((u) => u.role === 'DRIVER');
  const students = users.filter((u) => u.role === 'STUDENT');
  const term = searchTerm.toLowerCase();

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(term) ||
      d.email.toLowerCase().includes(term) ||
      (d.cdlNumber || '').toLowerCase().includes(term)
  );
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      (s.studentId || '').toLowerCase().includes(term)
  );

  const assignedBusFor = (driverId: string) => buses.find((b) => b.currentDriverId === driverId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Drivers & Students</h2>
          <p className="text-xs text-slate-500">Campus accounts stored for this college</p>
        </div>
        <div className="w-full sm:w-72">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={`Search ${tab.toLowerCase()} by name, ID...`}
          />
        </div>
      </div>

      <div className="flex border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setTab('DRIVERS')}
          className={`pb-3 px-4 flex items-center gap-2 cursor-pointer border-b-2 min-h-11 transition-colors ${
            tab === 'DRIVERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bus className="w-4 h-4" />
          <span>Drivers ({drivers.length})</span>
        </button>
        <button
          onClick={() => setTab('STUDENTS')}
          className={`pb-3 px-4 flex items-center gap-2 cursor-pointer border-b-2 min-h-11 transition-colors ${
            tab === 'STUDENTS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Students ({students.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading directory…
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-2 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          {tab === 'DRIVERS' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Driver Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Assigned Vehicle</th>
                    <th className="py-3 px-4">CDL License</th>
                    <th className="py-3 px-4">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                        No drivers registered for this campus.
                      </td>
                    </tr>
                  ) : filteredDrivers.map((driver) => {
                    const assigned = assignedBusFor(driver.id);
                    return (
                      <tr key={driver.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div>{driver.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{driver.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {driver.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {assigned ? assigned.busNumber : <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">{driver.cdlNumber || '—'}</td>
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{driver.phone || '—'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Institutional ID</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                        No students registered for this campus.
                      </td>
                    </tr>
                  ) : filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div>{student.name}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700">{student.studentId || '—'}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{student.email}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {student.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-500">
                        {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
