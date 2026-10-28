import React, { useState } from 'react';
import { Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/authService';

export const PasswordChangeForm: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    const result = await authService.changePassword(currentPassword, newPassword);
    setSaving(false);
    if (!result.success) {
      setError(result.error || 'Failed to update password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccess(true);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <Lock className="w-4 h-4 text-blue-600" />
        Change Password
      </h3>
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800" role="status">
          <CheckCircle2 className="w-4 h-4" />
          Password updated.
        </div>
      )}
      <div>
        <label htmlFor="current-password" className="block text-xs font-bold text-slate-700 mb-1">Current password</label>
        <input
          id="current-password"
          type={show ? 'text' : 'password'}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full min-h-11 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />
      </div>
      <div>
        <label htmlFor="new-password" className="block text-xs font-bold text-slate-700 mb-1">New password</label>
        <div className="relative">
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full min-h-11 px-3 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 mb-1">Confirm new password</label>
        <input
          id="confirm-password"
          type={show ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full min-h-11 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="min-h-11 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs rounded-xl cursor-pointer inline-flex items-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? 'Saving…' : 'Update password'}
      </button>
    </form>
  );
};
