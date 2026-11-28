import { Link } from 'react-router-dom';
import { ArrowRight, Bus, GraduationCap, ShieldCheck } from 'lucide-react';
import { PortalHeader } from '../components/brand/PortalHeader';

const roles = [
  { id: 'student', name: 'Student', icon: GraduationCap, description: 'Find your route, plan a departure, and see your shuttle on the map.' },
  { id: 'driver', name: 'Driver', icon: Bus, description: 'Open your assignment, run trips, and share live location.' },
  { id: 'admin', name: 'Admin', icon: ShieldCheck, description: 'Manage vehicles, routes, schedules, and campus alerts.' },
] as const;

export const LandingPage = () => (
  <div className="campus-surface min-h-screen">
    <PortalHeader>
      <Link className="campus-action" to="/roles">Sign in <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
    </PortalHeader>

    <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-8 sm:pt-10">
      <section aria-labelledby="campus-shuttle-title"
        className="grid overflow-hidden rounded-3xl bg-slate-950 text-white lg:grid-cols-[1.03fr_1fr]">
        <div className="flex flex-col items-start justify-center px-6 py-9 sm:px-12 sm:py-14">
          <h1 id="campus-shuttle-title" className="max-w-[12ch] text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            Catch your campus shuttle
          </h1>
          <p className="mt-5 max-w-[39ch] text-base leading-relaxed text-slate-200 sm:text-lg">
            Check schedules and follow your bus once your campus driver starts a trip.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/roles" className="campus-action bg-white text-slate-950 hover:bg-indigo-100">
              Sign in to CampusBus <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link to="/login?role=student&mode=register"
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-indigo-100 underline underline-offset-4">
              Create a student account
            </Link>
          </div>
        </div>
        <img src="/images/campus-shuttle.webp" alt="" width="1280" height="960"
          fetchPriority="high" className="aspect-[4/3] h-full w-full max-h-[31rem] object-cover lg:max-h-none" />
      </section>

      <nav aria-label="CampusBus workspaces" className="mt-5 grid gap-3 sm:grid-cols-3">
        {roles.map(({ id, name, icon: Icon, description }) => (
          <Link key={id} to={`/login?role=${id}`} className="campus-panel group flex items-start gap-3 px-4 py-4 hover:border-indigo-300 sm:px-5">
            <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
            <div className="min-w-0 flex-1">
              <h2 className="campus-heading font-extrabold">{name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
            <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-indigo-700" />
          </Link>
        ))}
      </nav>
    </main>
  </div>
);
