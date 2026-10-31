import React, { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { apiClient } from '../../services/apiClient';
import { adminV1 } from '../../services/v1/admin';
import { busesV1 } from '../../services/v1/buses';
import { routesV1 } from '../../services/v1/routes';
import { SearchInput } from '../../components/common/Inputs';
import { Modal, ConfirmDialog } from '../../components/common/Modals';
import { EmptyState } from '../../components/common/States';
import {
  Users,
  Bus,
  GraduationCap,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Key,
  Trash2,
  UserCheck,
  UserX,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';

const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

interface DirectoryUser {
  id: string;
  collegeId: string;
  email: string;
  name: string;
  role: 'DRIVER' | 'STUDENT' | 'ADMIN';
  studentId?: string;
  cdlNumber?: string;
  phone?: string;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: string;
  assignedBusId?: string | null;
  assignedBusNumber?: string | null;
  assignedRouteId?: string | null;
  assignedRouteName?: string | null;
  assignedRouteCode?: string | null;
}

export const AdminDirectory: React.FC = () => {
  const { currentCollege } = useApp();
  const [tab, setTab] = useState<'DRIVERS' | 'STUDENTS'>('DRIVERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Create Driver Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCdl, setCreateCdl] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset Password Modal State
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Status Change Dialog
  const [deactivatingUser, setDeactivatingUser] = useState<DirectoryUser | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (USE_V1) {
        const [userPage, busPage, routePage] = await Promise.all([
          adminV1.users.list({ pageSize: 100 }),
          busesV1.list(),
          routesV1.list(),
        ]);
        const busById = new Map(busPage.items.map((b) => [b.id, b]));
        const routeById = new Map(routePage.items.map((r) => [r.id, r]));
        setUsers(userPage.items.map((u) => {
          const assignedBus = u.assignedBusId ? busById.get(u.assignedBusId) : undefined;
          const assignedRoute = u.assignedRouteId ? routeById.get(u.assignedRouteId) : undefined;
          return {
            id: u.id,
            collegeId: u.campusId,
            email: u.email,
            name: u.name,
            role: u.role,
            phone: u.phone ?? undefined,
            status: u.status === 'ACTIVE' ? 'ACTIVE' : 'DEACTIVATED',
            createdAt: '',
            assignedBusId: u.assignedBusId ?? null,
            assignedBusNumber: assignedBus?.number ?? null,
            assignedRouteId: u.assignedRouteId ?? null,
            assignedRouteName: assignedRoute?.name ?? null,
            assignedRouteCode: assignedRoute?.code ?? null,
          } as DirectoryUser;
        }));
        return;
      }
      const res = await apiClient.get<DirectoryUser[]>('/api/users');
      setUsers(res || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load user directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const drivers = users.filter((u) => u.role === 'DRIVER');
  const students = users.filter((u) => u.role === 'STUDENT');

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.cdlNumber && d.cdlNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.assignedBusNumber && d.assignedBusNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.studentId && s.studentId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      setCreateError('Name, institutional email, and temporary password are required.');
      return;
    }

    if (createPassword.length < 8) {
      setCreateError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      if (USE_V1) {
        await adminV1.users.createDriver({
          name: createName.trim(),
          email: createEmail.trim(),
          password: createPassword,
          phone: createPhone.trim() || undefined,
        });
      } else {
        await apiClient.post('/api/users/drivers', {
          name: createName,
          email: createEmail,
          phone: createPhone,
          cdlNumber: createCdl,
          password: createPassword,
        });
      }

      setSuccessNotice(`Driver account created for ${createName}.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      setIsCreateModalOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreatePhone('');
      setCreateCdl('');
      setCreatePassword('');
      await fetchUsers();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create driver account.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleToggleStatus = async (user: DirectoryUser) => {
    const nextStatus = user.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    try {
      if (USE_V1) {
        await adminV1.users.setStatus(user.id, nextStatus === 'ACTIVE' ? 'ACTIVE' : 'DISABLED');
      } else {
        await apiClient.put(`/api/users/${user.id}`, { status: nextStatus });
      }
      setSuccessNotice(`Account status updated to ${nextStatus}.`);
      setTimeout(() => setSuccessNotice(null), 3000);
      setDeactivatingUser(null);
      await fetchUsers();
    } catch (err: any) {
      alert(err?.message || 'Failed to update account status.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || newPassword.length < 8) {
      setResetError('New password must be at least 8 characters long.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      await apiClient.post(`/api/users/${resetUserId}/reset-password`, { newPassword });
      setSuccessNotice(`Password reset successfully for ${resetUserName}.`);
      setTimeout(() => setSuccessNotice(null), 4000);
      setResetUserId(null);
      setNewPassword('');
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset password.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Drivers &amp; User Accounts
          </h2>
          <p className="text-xs text-slate-500">
            Provision and manage certified shuttle operators and student transit pass holders
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'DRIVERS' && (
            <button
              onClick={() => {
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Driver Account</span>
            </button>
          )}
        </div>
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

      {/* Roster Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex text-xs font-bold gap-2">
          <button
            onClick={() => setTab('DRIVERS')}
            className={`pb-2.5 px-4 flex items-center gap-2 cursor-pointer border-b-2 transition-colors ${
              tab === 'DRIVERS'
                ? 'border-blue-600 text-blue-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bus className="w-4 h-4" />
            <span>Campus Shuttle Drivers ({drivers.length})</span>
          </button>
          <button
            onClick={() => setTab('STUDENTS')}
            className={`pb-2.5 px-4 flex items-center gap-2 cursor-pointer border-b-2 transition-colors ${
              tab === 'STUDENTS'
                ? 'border-blue-600 text-blue-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Student Commuters ({students.length})</span>
          </button>
        </div>

        <div className="w-full sm:w-72">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={`Search ${tab.toLowerCase()} by name, ID...`}
          />
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span>Loading accounts from database...</span>
          </div>
        ) : tab === 'DRIVERS' ? (
          filteredDrivers.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No drivers registered"
                description="No drivers found in this campus roster. Drivers are provisioned by administrators."
                icon={Bus}
                actionLabel="Create Driver Account"
                onAction={() => setIsCreateModalOpen(true)}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Driver Name</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Assigned Vehicle</th>
                    <th className="py-3 px-4">CDL License</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDrivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-[11px]">
                            {driver.name.charAt(0)}
                          </div>
                          <div>
                            <div>{driver.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{driver.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            driver.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              driver.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {driver.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {driver.assignedBusNumber ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{driver.assignedBusNumber}</span>
                            {driver.assignedRouteCode && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">
                                {driver.assignedRouteCode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {driver.cdlNumber || <span className="text-slate-400">—</span>}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {driver.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{driver.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setResetUserId(driver.id);
                              setResetUserName(driver.name);
                              setResetError(null);
                              setNewPassword('');
                            }}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Reset password credentials"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeactivatingUser(driver)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              driver.status === 'ACTIVE'
                                ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={driver.status === 'ACTIVE' ? 'Deactivate account' : 'Reactivate account'}
                          >
                            {driver.status === 'ACTIVE' ? (
                              <UserX className="w-3.5 h-3.5" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredStudents.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No students registered"
              description="Student transit accounts will appear here as students self-register for transit passes."
              icon={GraduationCap}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Institutional ID</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Campus Pass</th>
                  <th className="py-3 px-4 text-right">Registered Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div>{student.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{student.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {student.studentId || <span className="text-slate-400 italic">Unassigned</span>}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          student.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        VALIDATED PASS
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right text-slate-500 font-mono">
                      {new Date(student.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Driver Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Provision Driver Account"
      >
        <form onSubmit={handleCreateDriver} className="space-y-4 text-xs">
          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Full Legal Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. David Kim"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Institutional Email</label>
            <input
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="e.g. david.kim@transit.apex.edu"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">CDL Number</label>
              <input
                type="text"
                value={createCdl}
                onChange={(e) => setCreateCdl(e.target.value)}
                placeholder="e.g. CDL-CA-99201"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="e.g. (555) 234-8905"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Temporary Password (min 8 chars)</label>
            <input
              type="password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              placeholder="Secure password for driver login"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmittingCreate ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <span>Provision Driver</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={resetUserId !== null}
        onClose={() => setResetUserId(null)}
        title={`Reset Password for ${resetUserName}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
          {resetError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">New Secure Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetUserId(null)}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReset}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmittingReset ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Reset Credentials</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Deactivation Dialog */}
      <ConfirmDialog
        isOpen={deactivatingUser !== null}
        onClose={() => setDeactivatingUser(null)}
        onConfirm={() => deactivatingUser && handleToggleStatus(deactivatingUser)}
        title={deactivatingUser?.status === 'ACTIVE' ? 'Deactivate Account' : 'Reactivate Account'}
        message={
          deactivatingUser?.status === 'ACTIVE'
            ? `Are you sure you want to deactivate ${deactivatingUser?.name}? Deactivated drivers will be immediately blocked from logging in or transmitting live trip GPS.`
            : `Are you sure you want to reactivate ${deactivatingUser?.name}? The driver will regain access to assignments.`
        }
        confirmLabel={deactivatingUser?.status === 'ACTIVE' ? 'Deactivate Account' : 'Reactivate'}
        isDangerous={deactivatingUser?.status === 'ACTIVE'}
      />
    </div>
  );
};
