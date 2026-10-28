import React from 'react';
import { useApp } from '../../store/AppContext';
import { GraduationCap, CheckCircle2 } from 'lucide-react';
import { ChangePasswordCard } from '../../components/common/ChangePasswordCard';

export const StudentProfile: React.FC = () => {
  const { currentUser, currentCollege, routes } = useApp();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 border-2 border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xl overflow-hidden shadow-xs">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <GraduationCap className="w-8 h-8" />
            )}
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              Verified Student Transit Pass
            </div>
            <h2 className="text-xl font-bold text-slate-900">{currentUser?.name}</h2>
            <p className="text-xs text-slate-500">{currentUser?.email}</p>
            <p className="text-xs text-slate-600 mt-1">
              Student ID: <span className="font-mono font-bold text-slate-900">{currentUser?.studentId || 'Not assigned'}</span>
            </p>
          </div>
        </div>

        {/* Digital Campus Transit Pass */}
        <div className="mt-6 bg-gradient-to-br from-slate-900 to-blue-950 text-white p-5 rounded-xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] text-blue-300 uppercase tracking-widest font-bold">
                {currentCollege.name}
              </div>
              <div className="text-base font-black tracking-tight">Digital Bus Pass</div>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-bold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Active
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400 text-[11px]">Pass Holder</div>
              <div className="font-bold text-white">{currentUser?.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[11px]">Campus</div>
              <div className="font-bold text-white">{currentCollege.campusName || currentCollege.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[11px]">Account Status</div>
              <div className="font-bold text-white">{currentUser?.status || 'ACTIVE'}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[11px]">Email</div>
              <div className="font-mono text-[11px] text-blue-300 truncate">{currentUser?.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Favorite Lines */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Saved Transit Lines</h3>
        <div className="space-y-2">
          {routes.slice(0, 2).map((route) => (
            <div
              key={route.id}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: route.color }}
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {route.code} — {route.name}
                  </div>
                  <div className="text-[11px] text-slate-500">{route.stops.length} stops • Every {route.frequencyMinutes}m</div>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Saved
              </span>
            </div>
          ))}
          {routes.length === 0 && (
            <p className="text-xs text-slate-500">No campus routes are published yet.</p>
          )}
        </div>
      </div>
      <ChangePasswordCard />
    </div>
  );
};
