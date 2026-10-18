import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bus, Mail, Lock, User, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Building2 } from 'lucide-react';
import { authService } from '../../services/authService';
import { loginV1, registerV1, listCampuses, type V1Campus } from '../../services/v1/auth';
import { socketV1 } from '../../services/v1/socket';

type Mode = 'login' | 'register';
const USE_V1 = (import.meta as any).env?.VITE_USE_V1_API === 'true';

const REDIRECT: Record<string, string> = {
  STUDENT: '/student',
  DRIVER: '/driver',
  ADMIN: '/admin',
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode]             = useState<Mode>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [role, setRole]             = useState<'STUDENT' | 'DRIVER'>('STUDENT');
  const [campusId, setCampusId]     = useState('');
  const [campuses, setCampuses]     = useState<V1Campus[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [error, setError]           = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load campuses for the v1 selector
  useEffect(() => {
    if (!USE_V1) return;
    setCampusLoading(true);
    listCampuses()
      .then((list) => {
        setCampuses(list);
        if (list.length === 1) setCampusId(list[0].id);
      })
      .finally(() => setCampusLoading(false));
  }, []);

  // ── Legacy login/register ─────────────────────────────────────────────────
  const handleLegacy = async () => {
    if (mode === 'login') {
      const result = await authService.login(email, password);
      if (result.success && result.user) {
        navigate(REDIRECT[result.user.role] ?? '/student', { replace: true });
      } else {
        setError(result.error ?? 'Login failed.');
      }
    } else {
      if (!name.trim()) { setError('Name is required.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      const result = await authService.register({ email, password, name, role, collegeId: 'college_apex' });
      if (result.success && result.user) {
        navigate(REDIRECT[result.user.role] ?? '/student', { replace: true });
      } else {
        setError(result.error ?? 'Registration failed.');
      }
    }
  };

  // ── v1 login/register ──────────────────────────────────────────────────────
  const handleV1 = async () => {
    if (!campusId) { setError('Please select your campus.'); return; }
    if (mode === 'login') {
      const res = await loginV1(campusId, email, password);
      if (res.ok) {
        authService.setV1Session(res.result.user);
        socketV1.connect();
        navigate(REDIRECT[res.result.user.role] ?? '/student', { replace: true });
      } else {
        setError(res.error);
      }
    } else {
      if (!name.trim()) { setError('Name is required.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      const res = await registerV1({ campusId, email, password, name, role });
      if (res.ok) {
        if (role === 'DRIVER') {
          setMode('login');
          setError('');
          setPassword('');
          setName('');
          alert('Account created! An admin must approve your account before you can sign in.');
        } else {
          // Students may be able to log in immediately (if campus doesn't require approval)
          const loginRes = await loginV1(campusId, email, password);
          if (loginRes.ok) {
            authService.setV1Session(loginRes.result.user);
            socketV1.connect();
            navigate('/student', { replace: true });
          } else {
            setMode('login');
            setError('Account created! Please sign in.');
            setPassword('');
          }
        }
      } else {
        setError(res.error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      if (USE_V1) await handleV1();
      else await handleLegacy();
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="p-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white mx-auto mb-4 shadow-sm">
              <Bus className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">CampusMove</h1>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campus selector — v1 only */}
              {USE_V1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Campus</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    {campusLoading ? (
                      <div className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400">
                        Loading campuses…
                      </div>
                    ) : campuses.length === 0 ? (
                      <div className="w-full pl-9 pr-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-600">
                        No campuses found — contact your administrator.
                      </div>
                    ) : (
                      <select
                        value={campusId}
                        onChange={(e) => setCampusId(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {campuses.length > 1 && <option value="">Select campus…</option>}
                        {campuses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Register-only fields */}
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name" required
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                    <select value={role} onChange={(e) => setRole(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="STUDENT">Student</option>
                      <option value="DRIVER">Driver</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@college.edu" required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Enter password' : 'Min 8 characters'} required
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit"
                disabled={isSubmitting || (USE_V1 && campusLoading)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>

          <div className="text-center mt-4">
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-semibold cursor-pointer">
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 text-center text-xs text-slate-400">
        CampusMove — Smart campus bus tracking
      </div>
    </div>
  );
};
