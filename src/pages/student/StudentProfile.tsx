import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { ChangePasswordCard } from '../../components/common/ChangePasswordCard';

export const StudentProfile: React.FC = () => {
  const { currentUser, currentCollege, buses, routes } = useApp();
  const assignedFleet = buses.filter(bus => bus.canTrack);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
          <GraduationCap className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold text-slate-900">{currentUser?.name}</h2>
          <p className="break-words text-sm text-slate-600">{currentUser?.email}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{currentCollege.name} · Student account</p>
        </div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Vehicles you can track</h3>
        {assignedFleet.length ? (
          <ul className="divide-y divide-slate-100">
            {assignedFleet.map(bus => (
              <li key={bus.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-semibold text-slate-900">{bus.busNumber}</span>
                <span className="text-slate-700">{routes.find(route => route.id === bus.currentRouteId)?.name ?? 'Route unassigned'}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-700">Campus dispatch has not assigned a vehicle or route to this account.</p>}
        <Link to="/student/live" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline">Open vehicle tracking</Link>
      </section>
      <ChangePasswordCard />
    </div>
  );
};
