import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Building2 } from 'lucide-react';
import { authService } from '../../services/authService';
import {
  loginV1, registerV1, logoutV1, listCampuses, formatCampusFetchError, type V1Campus,
  requestPasswordResetV1, confirmPasswordResetV1, formatPasswordResetError,
} from '../../services/v1/auth';
import { socketV1 } from '../../services/v1/socket';
import { BrandMark } from '../../components/brand/BrandMark';
import {
  ROLE_REDIRECT,
  canSelfRegister,
  parseIntendedRole,
  roleLabel,
} from './roleAccess';
import type { UserRole } from '../../types';

type Mode = 'login' | 'register' | 'request-reset' | 'confirm-reset';

function mismatchMessage(accountRole: UserRole, intended: UserRole): string {
  return `This account is a ${roleLabel(accountRole)}, not a ${roleLabel(intended)}. Sign in from the matching role, or switch roles.`;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intendedRole = parseIntendedRole(searchParams.get('role'));
  const registerRequested = searchParams.get('mode') === 'register';
  const registerAllowed = registerRequested && (intendedRole === null || canSelfRegister(intendedRole));

  const [mode, setMode] = useState<Mode>(registerAllowed ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [campuses, setCampuses] = useState<V1Campus[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [campusError, setCampusError] = useState('');
  const [campusLoadAttempt, setCampusLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const recovering = mode === 'request-reset' || mode === 'confirm-reset';

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setShowPassword(false);
    setOtp('');
  };

  useEffect(() => {
    setMode(registerAllowed ? 'register' : 'login');
    setError('');
  }, [registerAllowed, intendedRole]);

  useEffect(() => {
    if (!authService.isAuthenticated()) return;
    const user = authService.getCurrentUser();
    if (user) navigate(ROLE_REDIRECT[user.role], { replace: true });
  }, [navigate]);

  useEffect(() => {
    let current = true;
    setCampusLoading(true);
    setCampusError('');
    listCampuses()
      .then((list) => {
        if (!current) return;
        setCampuses(list);
        setCampusId(selected => list.length === 1 ? list[0].id : list.some(campus => campus.id === selected) ? selected : '');
      })
      .catch((err) => {
        if (!current) return;
        setCampuses([]);
        setCampusId('');
        setCampusError(formatCampusFetchError(err));
      })
      .finally(() => { if (current) setCampusLoading(false); });
    return () => { current = false; };
  }, [campusLoadAttempt]);

  const registerRole = 'STUDENT' as const;

  const handleV1 = async () => {
    if (!campusId) { setError('Please select your campus.'); return; }
    if (recovering) {
      try {
        if (mode === 'request-reset') {
          await requestPasswordResetV1(campusId, email);
          changeMode('confirm-reset');
          setNotice('If an active account matches these details, you’ll receive a code by email.');
        } else {
          if (!/[A-Za-z]/.test(password) || !/[0-9!@#$%^&*]/.test(password)) {
            setError('Use a letter and a number or symbol in your new password.');
            return;
          }
          await confirmPasswordResetV1(campusId, email, otp, password);
          changeMode('login');
          setNotice('Password changed. Sign in with your new password.');
        }
      } catch (error) {
        setError(formatPasswordResetError(error));
      }
      return;
    }
    if (mode === 'login') {
      const res = await loginV1(campusId, email, password);
      if (res.ok) {
        const accountRole = res.result.user.role;
        if (intendedRole && accountRole !== intendedRole) {
          await logoutV1();
          setError(mismatchMessage(accountRole, intendedRole));
          return;
        }
        authService.setV1Session(res.result.user);
        socketV1.connect();
        navigate(ROLE_REDIRECT[accountRole] ?? '/student', { replace: true });
      } else {
        setError(res.error);
      }
      return;
    }
    if (!canSelfRegister(registerRole)) {
      setError('Only student accounts can be created from this page.');
      return;
    }
    if (!name.trim()) { setError('Name is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    const res = await registerV1({ campusId, email, password, name, role: registerRole });
    if (res.ok) {
      const loginRes = await loginV1(campusId, email, password);
      if (loginRes.ok) {
        const accountRole = loginRes.result.user.role;
        if (intendedRole && accountRole !== intendedRole) {
          await logoutV1();
          setError(mismatchMessage(accountRole, intendedRole));
          return;
        }
        authService.setV1Session(loginRes.result.user);
        socketV1.connect();
        navigate(ROLE_REDIRECT[accountRole] ?? '/student', { replace: true });
      } else {
        setMode('login');
        setNotice('Account created. Please sign in.');
        setPassword('');
      }
    } else {
      setError(res.error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);
    try {
      await handleV1();
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = recovering ? 'Reset your password' :
    intendedRole === 'ADMIN'
      ? 'Admin sign in'
      : mode === 'register'
        ? `Create your ${roleLabel(registerRole).toLowerCase()} account`
        : intendedRole
          ? `Sign in as ${roleLabel(intendedRole)}`
          : 'Sign in to your account';

  const switchHref = mode === 'login'
    ? `/login?${new URLSearchParams({
        ...(intendedRole ? { role: intendedRole.toLowerCase() } : {}),
        mode: 'register',
      }).toString()}`
    : `/login${intendedRole ? `?role=${intendedRole.toLowerCase()}` : ''}`;

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <header className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <BrandMark compact />
          <Link
            to="/roles"
            className="inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Switch role
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">CampusBus</h1>
            <p className="text-sm text-slate-500 mt-1">{heading}</p>
            {intendedRole && (
              <p className="mt-3 inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Selected role: {roleLabel(intendedRole)}
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-sm text-rose-700" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            {notice && !error && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800" role="status">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                  <label htmlFor="campus" className="block text-xs font-bold text-slate-700 mb-1">Campus</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    {campusLoading ? (
                      <div className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400">
                        Loading campuses…
                      </div>
                    ) : campusError || campuses.length === 0 ? (
                      <div className="w-full pl-9 pr-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-600">
                        <p role="status">{campusError || 'No campuses have been set up yet. Contact your campus administrator.'}</p>
                        <button type="button" className="min-h-11 font-semibold underline" onClick={() => setCampusLoadAttempt(attempt => attempt + 1)}>
                          Retry campus directory
                        </button>
                      </div>
                    ) : (
                      <select
                        id="campus"
                        value={campusId}
                        onChange={(e) => setCampusId(e.target.value)}
                        disabled={mode === 'confirm-reset' || isSubmitting}
                        required
                        className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {campuses.length > 1 && <option value="">Select campus…</option>}
                        {campuses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

              {mode === 'register' && (
                <>
                  <div>
                    <label htmlFor="full-name" className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        id="full-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        required
                        autoComplete="name"
                        className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@college.edu"
                    required
                    autoComplete="email"
                    readOnly={mode === 'confirm-reset' || isSubmitting}
                    className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {mode === 'confirm-reset' && (
                <div>
                  <label htmlFor="reset-code" className="block text-xs font-bold text-slate-700 mb-1">Email code</label>
                  <input id="reset-code" value={otp} onChange={(e) => setOtp(e.target.value)}
                    inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
                    className="w-full min-h-11 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {mode !== 'request-reset' && <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">{mode === 'confirm-reset' ? 'New password' : 'Password'}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Enter password' : 'Min 8 characters'}
                    minLength={mode === 'login' ? undefined : 8}
                    maxLength={mode === 'login' ? 256 : 72}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full min-h-11 pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>}

              <button
                type="submit"
                disabled={isSubmitting || campusLoading || campuses.length === 0}
                className="w-full min-h-12 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-full shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                {isSubmitting ? 'Please wait…' : {
                  login: 'Sign In', register: 'Create Account', 'request-reset': 'Send reset code', 'confirm-reset': 'Reset password',
                }[mode]}
              </button>
            </form>
            {(recovering || mode === 'login') && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 text-sm font-semibold text-blue-700">
                {mode === 'confirm-reset' && (
                  <button type="button" disabled={isSubmitting} onClick={() => changeMode('request-reset')} className="min-h-11 hover:underline">
                    Request another code
                  </button>
                )}
                <button type="button" disabled={isSubmitting} onClick={() => changeMode(recovering ? 'login' : 'request-reset')} className="min-h-11 hover:underline">
                  {recovering ? 'Back to sign in' : 'Forgot password?'}
                </button>
              </div>
            )}
          </div>

          <div className="text-center mt-4 space-y-2">
            {!recovering && (canSelfRegister(intendedRole) || intendedRole === null ? (
              <Link
                to={switchHref}
                className="block text-sm text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                onClick={() => setError('')}
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </Link>
            ) : (
              <p className="text-xs text-slate-500">
                {intendedRole === 'DRIVER'
                  ? 'Driver accounts are provisioned by your campus admin. Public signup is not available.'
                  : 'Admin accounts are provisioned by your campus. Public signup is not available.'}
              </p>
            ))}
            <Link to="/" className="block text-sm text-slate-500 hover:text-slate-700 cursor-pointer">
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};
