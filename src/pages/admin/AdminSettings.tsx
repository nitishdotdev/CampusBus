import React, { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { apiClient } from '../../services/apiClient';
import { PasswordChangeForm } from '../../components/common/PasswordChangeForm';
import {
  CheckCircle2,
  Save,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export const AdminSettings: React.FC = () => {
  const { currentCollege } = useApp();
  const [campusName, setCampusName] = useState(currentCollege.name);
  const [gpsInterval, setGpsInterval] = useState('3');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient.get<any>(`/api/colleges/${currentCollege.id}`)
      .then((college) => {
        if (!mounted || !college) return;
        setCampusName(college.name || currentCollege.name);
        const settings = college.settings || {};
        setGpsInterval(String(settings.telemetryIntervalSec || 3));
        setEmergencyPhone(settings.emergencyPhone || '');
      })
      .catch(() => {
        setCampusName(currentCollege.name);
      });
    return () => {
      mounted = false;
    };
  }, [currentCollege.id, currentCollege.name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavedSuccess(false);
    setSaving(true);
    try {
      await apiClient.put(`/api/colleges/${currentCollege.id}`, {
        name: campusName.trim(),
        settings: {
          emergencyPhone: emergencyPhone.trim(),
          telemetryIntervalSec: Number(gpsInterval) || 3,
        },
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save campus settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Campus Transit Settings</h2>
        <p className="text-xs text-slate-500">
          Institution name, telemetry interval, and emergency contact stored for this campus
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Campus settings saved.</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Campus Institution Profile
          </h3>
          <div>
            <label htmlFor="institution-name" className="block text-xs font-bold text-slate-700 mb-1">
              Institution Name
            </label>
            <input
              id="institution-name"
              type="text"
              value={campusName}
              onChange={(e) => setCampusName(e.target.value)}
              className="w-full min-h-11 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
          <div>
            <label htmlFor="campus-code" className="block text-xs font-bold text-slate-700 mb-1">
              Campus Code
            </label>
            <input
              id="campus-code"
              type="text"
              disabled
              value={currentCollege.shortCode}
              className="w-full min-h-11 p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Driver GPS Telemetry Rate
          </h3>
          <div>
            <label htmlFor="gps-interval" className="block text-xs font-bold text-slate-700 mb-1">
              Driver Phone Ping Interval
            </label>
            <select
              id="gps-interval"
              value={gpsInterval}
              onChange={(e) => setGpsInterval(e.target.value)}
              className="w-full min-h-11 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <option value="2">2 seconds</option>
              <option value="3">3 seconds</option>
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Safety & Dispatch Contacts
          </h3>
          <div>
            <label htmlFor="emergency-phone" className="block text-xs font-bold text-slate-700 mb-1">
              Direct Emergency Hotline
            </label>
            <input
              id="emergency-phone"
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              className="w-full min-h-11 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving…' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      <PasswordChangeForm />
    </div>
  );
};
