import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bus,
  Check,
  GraduationCap,
  MapPin,
  Shield,
} from 'lucide-react';
import { BrandMark } from '../../components/brand/BrandMark';
import { authService } from '../../services/authService';
import { ROLE_REDIRECT, parseIntendedRole } from './roleAccess';

type RoleCardId = 'student' | 'driver' | 'admin';

const CARDS: Array<{
  id: RoleCardId;
  title: string;
  description: string;
  capabilities: string[];
  cta: string;
  icon: typeof GraduationCap;
  accent: string;
  iconWrap: string;
  button: string;
}> = [
  {
    id: 'student',
    title: 'Student',
    description: 'View routes, schedules, live bus locations, and notifications.',
    capabilities: [
      'View bus schedules',
      'See routes & stops',
      'Check running status',
      'Track buses live',
    ],
    cta: 'Continue as Student',
    icon: GraduationCap,
    accent: 'hover:border-blue-300 hover:shadow-blue-100/80 focus-visible:ring-blue-500',
    iconWrap: 'bg-blue-50 text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500',
  },
  {
    id: 'driver',
    title: 'Driver',
    description: 'Manage assigned trips, share device GPS, and update trip status.',
    capabilities: [
      'Start & end trips',
      'Manage assigned bus',
      'Share GPS location',
      'Update trip status',
    ],
    cta: 'Continue as Driver',
    icon: Bus,
    accent: 'hover:border-sky-300 hover:shadow-sky-100/80 focus-visible:ring-sky-500',
    iconWrap: 'bg-sky-50 text-sky-600',
    button: 'bg-sky-600 hover:bg-sky-700 focus-visible:ring-sky-500',
  },
  {
    id: 'admin',
    title: 'Admin',
    description: 'Manage buses, routes, drivers, schedules, alerts, and transport operations.',
    capabilities: [
      'Manage buses & routes',
      'Approve drivers',
      'Post announcements',
      'View analytics',
    ],
    cta: 'Admin Login',
    icon: Shield,
    accent: 'hover:border-indigo-300 hover:shadow-indigo-100/80 focus-visible:ring-indigo-500',
    iconWrap: 'bg-indigo-50 text-indigo-600',
    button: 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-900',
  },
];

export const RoleSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const signupRequested = searchParams.get('mode') === 'register';

  useEffect(() => {
    if (!authService.isAuthenticated()) return;
    const user = authService.getCurrentUser();
    if (user) navigate(ROLE_REDIRECT[user.role], { replace: true });
  }, [navigate]);

  const hrefFor = (id: RoleCardId) => {
    const params = new URLSearchParams();
    params.set('role', id);
    if (signupRequested && id !== 'admin') params.set('mode', 'register');
    return `/login?${params.toString()}`;
  };

  return (
    <div className="min-h-dvh bg-white text-slate-900 flex flex-col overflow-x-hidden">
      <a
        href="#choose-role"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-semibold"
      >
        Skip to role selection
      </a>

      <header className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <BrandMark compact />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Home
          </Link>
        </div>
      </header>

      <main id="choose-role" className="flex-1">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.08),_transparent_55%)] pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
            <div className="text-center max-w-2xl mx-auto landing-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1 text-xs font-semibold text-blue-700">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                CampusBus access
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-slate-900">
                Choose Your Role
              </h1>
              <p className="mt-3 text-base sm:text-lg text-slate-500">
                Select how you want to use CampusBus. Your account permissions are always verified by the server after you sign in.
              </p>
            </div>

            <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 landing-fade-up-delay">
              {CARDS.map((card) => {
                const Icon = card.icon;
                const to = hrefFor(card.id);
                const intended = parseIntendedRole(card.id);
                return (
                  <article
                    key={card.id}
                    className={`flex flex-col rounded-2xl border border-slate-100 bg-white p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 ${card.accent}`}
                  >
                    <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.iconWrap}`}>
                      <Icon className="w-6 h-6" aria-hidden="true" />
                    </span>
                    <h2 className="mt-5 text-xl font-extrabold text-slate-900">{card.title}</h2>
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{card.description}</p>
                    <ul className="mt-5 space-y-2.5 flex-1">
                      {card.capabilities.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    {card.id === 'admin' && (
                      <p className="mt-4 text-xs text-slate-400">
                        Admin accounts are provisioned by your campus. Public registration is not available.
                      </p>
                    )}
                    <Link
                      to={to}
                      aria-label={`${card.cta}${intended ? ` — ${card.title} access` : ''}`}
                      className={`mt-6 min-h-12 px-5 inline-flex items-center justify-center gap-2 rounded-full text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${card.button}`}
                    >
                      {card.cta}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>

            <p className="mt-10 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Return to Home Page
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
