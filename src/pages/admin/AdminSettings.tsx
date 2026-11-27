import React, { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { updateCampusSettings } from '../../services/v1/auth';

export const AdminSettings: React.FC = () => {
  const { currentCollege, refreshData } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interval, setIntervalSeconds] = useState(3);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setName(currentCollege.name);
    setPhone(currentCollege.dispatchPhone ?? '');
    setIntervalSeconds(currentCollege.gpsIntervalSeconds ?? 3);
  }, [currentCollege.id, currentCollege.name, currentCollege.dispatchPhone, currentCollege.gpsIntervalSeconds]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice('');
    setError('');
    try {
      await updateCampusSettings({ name, dispatchPhone: phone.trim() || null, gpsIntervalSeconds: interval });
      setNotice('Campus settings saved.');
      await refreshData();
    } catch {
      setError('Could not save campus settings. Check the form and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h2 className="text-xl font-bold text-slate-900">Campus Transit Settings &amp; Policies</h2>
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <label className="block font-semibold">
          Institution name
          <input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3" />
        </label>
        <p className="text-slate-600">Campus code {currentCollege.shortCode || 'unavailable'}</p>
        <label className="block font-semibold">
          Minimum GPS reporting interval
          <input type="number" value={interval} onChange={event => setIntervalSeconds(Number(event.target.value))} required min={2} max={10}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          <span className="mt-1 block text-xs font-normal text-slate-600">Seconds between recorded device fixes. Actual timing depends on the device.</span>
        </label>
        <label className="block font-semibold">
          Dispatch phone
          <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={32}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3" />
        </label>
        <button type="submit" disabled={pending || !currentCollege.id} className="min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:bg-slate-400">
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  );
};
