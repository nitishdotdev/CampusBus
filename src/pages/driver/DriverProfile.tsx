import React from 'react';
import { useApp } from '../../store/AppContext';
import { Bus, CheckCircle2 } from 'lucide-react';
import { PasswordChangeForm } from '../../components/common/PasswordChangeForm';

export const DriverProfile: React.FC = () => {
  const { currentUser, buses, routes } = useApp();
  const assignedBus = buses.find((b) => b.currentDriverId === currentUser?.id);
  const assignedRoute = assignedBus?.currentRouteId
    ? routes.find((r) => r.id === assignedBus.currentRouteId)
    : undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xl overflow-hidden shadow-xs">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Bus className="w-8 h-8" />
            )}
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Campus Transit Operator
            </div>
            <h2 className="text-xl font-bold text-slate-900">{currentUser?.name}</h2>
            <p className="text-xs text-slate-500">{currentUser?.email}</p>
            <p className="text-xs text-slate-600 mt-1">
              Driver ID: <span className="font-mono font-bold text-slate-900">{currentUser?.id}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 pt-6 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="text-slate-500 text-[11px] font-semibold uppercase">CDL License</div>
            <div className="font-bold text-slate-900 mt-0.5">{currentUser?.cdlNumber || 'Not on file'}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="text-slate-500 text-[11px] font-semibold uppercase">Phone</div>
            <div className="font-bold text-slate-900 mt-0.5">{currentUser?.phone || 'Not on file'}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Bus className="w-4 h-4 text-blue-600" />
          Assigned Vehicle
        </h3>
        {assignedBus ? (
          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-base font-black text-slate-900">{assignedBus.busNumber}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                {assignedBus.model} • License Plate: {assignedBus.plateNumber}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Capacity: {assignedBus.capacity} passengers
                {assignedRoute ? ` • Route ${assignedRoute.code}` : ' • No route assigned'}
              </div>
            </div>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg shrink-0 self-start sm:self-auto flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Assigned
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            No bus is assigned to your account. An administrator must assign a vehicle before you can start a trip.
          </p>
        )}
      </div>
      <PasswordChangeForm />
    </div>
  );
};
