import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bus, GraduationCap, ShieldCheck } from 'lucide-react';
import { PortalHeader } from '../../components/brand/PortalHeader';
import { authService } from '../../services/authService';
import { ROLE_REDIRECT } from './roleAccess';

const roles = [
  { id: 'student', title: 'Student', description: 'See routes, departure times and live shuttle positions.', icon: GraduationCap },
  { id: 'driver', title: 'Driver', description: 'View your assignment, operate trips and report incidents.', icon: Bus },
  { id: 'admin', title: 'Admin', description: 'Manage the fleet, campus routes and service alerts.', icon: ShieldCheck },
] as const;

export function RoleSelectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const registering = params.get('mode') === 'register';

  useEffect(() => {
    if (!authService.isAuthenticated()) return;
    const user = authService.getCurrentUser();
    if (user) navigate(ROLE_REDIRECT[user.role], { replace: true });
  }, [navigate]);

  return (
    <div className="campus-surface min-h-screen">
      <PortalHeader>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Home
        </Link>
      </PortalHeader>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
        <h1 className="campus-heading text-3xl font-extrabold tracking-tight sm:text-5xl">Choose your role</h1>
        <p className="mt-3 text-base text-slate-600">Select the role assigned to your campus account.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {roles.map(({ id, title, description, icon: Icon }) => {
            const signup = registering && id === 'student';
            return (
              <Link key={id} to={`/login?role=${id}${signup ? '&mode=register' : ''}`}
                className="campus-panel flex min-h-11 flex-col p-5 hover:border-indigo-300">
                <Icon aria-hidden="true" className="h-6 w-6 text-indigo-700" />
                <h2 className="campus-heading mt-4 text-xl font-extrabold">{title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-indigo-800">
                  {signup ? 'Create student account' : `Continue as ${title}`} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
