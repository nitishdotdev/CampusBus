import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import {
  ArrowRight,
  Bell,
  Bus,
  Calendar,
  CheckCircle2,
  Leaf,
  MapPin,
  Menu,
  Navigation,
  Radio,
  Route as RouteIcon,
  Shield,
  ShieldCheck,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#features', label: 'Routes' },
  { href: '#features', label: 'Live Tracking' },
  { href: '#about', label: 'About' },
] as const;

const FEATURES = [
  {
    title: 'Real-Time Tracking',
    body: 'Know exactly where your bus is and follow its progress on a live campus map after you sign in.',
    icon: MapPin,
    tone: 'blue',
  },
  {
    title: 'Route & Schedule Info',
    body: 'Explore campus routes, timings, and stops so you can plan your journey before you leave.',
    icon: Calendar,
    tone: 'green',
  },
  {
    title: 'Instant Notifications',
    body: 'Get updates on delays, route changes, and campus-wide alerts as soon as they are published.',
    icon: Bell,
    tone: 'violet',
  },
  {
    title: 'Safe & Secure',
    body: 'Role-based access, authenticated GPS, and emergency alerts keep campus transit accountable.',
    icon: Shield,
    tone: 'amber',
  },
] as const;

const STEPS = [
  {
    n: '1',
    title: 'Sign Up',
    body: 'Create your account in seconds.',
    icon: UserPlus,
    tone: 'blue',
  },
  {
    n: '2',
    title: 'Choose Route',
    body: 'Pick your preferred bus route.',
    icon: RouteIcon,
    tone: 'violet',
  },
  {
    n: '3',
    title: 'Track Live',
    body: 'See your bus in real time on the map.',
    icon: Bus,
    tone: 'green',
  },
  {
    n: '4',
    title: 'Reach Safely',
    body: 'Arrive at your destination with confidence.',
    icon: CheckCircle2,
    tone: 'sky',
  },
] as const;

const HIGHLIGHTS = [
  { icon: Bus, title: 'Live GPS Tracking', body: 'Follow buses from authenticated driver devices.' },
  { icon: Radio, title: 'Role-Based Access', body: 'Separate student, driver, and admin workspaces.' },
  { icon: ShieldCheck, title: 'Campus Alerts', body: 'Emergency SOS and broadcast notifications.' },
  { icon: Leaf, title: 'Smarter Commutes', body: 'Plan routes and skip unnecessary waiting.' },
] as const;

const TONE_ICON: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-orange-50 text-orange-500',
  sky: 'bg-sky-50 text-sky-600',
};

const AppPreview: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[420px]">
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
      <span className="inline-flex items-center rounded-full bg-white/90 backdrop-blur px-3 py-1 text-[11px] font-semibold text-slate-500 border border-slate-200 shadow-sm">
        App preview — not live tracking
      </span>
    </div>

    <div className="relative pt-6">
      <div className="relative mx-auto w-[250px] sm:w-[270px] rounded-[2.4rem] border-[10px] border-slate-900 bg-slate-900 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.45)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-slate-900 rounded-b-2xl z-10" />
        <div className="rounded-[1.7rem] overflow-hidden bg-[#f4f7fb] aspect-[9/19] flex flex-col">
          <div className="px-4 pt-7 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center">
                <Bus className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-extrabold text-slate-900">CampusBus</span>
            </div>
            <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="px-4">
            <p className="text-[15px] font-extrabold text-slate-900 leading-tight">Good Morning, Student!</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              Find your bus, track in real-time, and reach your destination.
            </p>
            <div className="mt-3 h-8 rounded-xl bg-white border border-slate-200 flex items-center px-3 text-[10px] text-slate-400 gap-2">
              <span className="w-3 h-3 rounded-full border border-slate-300" />
              Search for a route or stop…
            </div>
          </div>
          <div className="px-4 mt-3 space-y-2 flex-1">
            {[
              { name: 'Route 1', path: 'Main Gate → Hostels', color: 'bg-blue-500' },
              { name: 'Route 2', path: 'Academic Block → Hostels', color: 'bg-emerald-500' },
              { name: 'Route 3', path: 'Library → Hostels', color: 'bg-violet-500' },
              { name: 'Route 4', path: 'Mess → Main Gate', color: 'bg-orange-400' },
            ].map((route) => (
              <div key={route.name} className={`${route.color} text-white rounded-xl px-3 py-2 flex items-center gap-2`}>
                <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                  <Bus className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[11px] font-bold leading-none">{route.name}</div>
                  <div className="text-[9px] text-white/80 mt-0.5">{route.path}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-2.5 text-[8px] font-semibold text-slate-400">
            {[
              { label: 'Home', Icon: Bus, active: true },
              { label: 'Live Map', Icon: Navigation, active: false },
              { label: 'Routes', Icon: RouteIcon, active: false },
              { label: 'Profile', Icon: UserPlus, active: false },
            ].map(({ label, Icon, active }) => (
              <div key={label} className={`flex flex-col items-center gap-0.5 ${active ? 'text-blue-600' : ''}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden sm:block absolute right-0 top-16 w-[180px] rounded-2xl bg-white border border-slate-200 shadow-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Bus className="w-4 h-4" aria-hidden="true" />
          </span>
          <div>
            <div className="text-[11px] font-bold text-slate-800">Campus map</div>
            <div className="text-[10px] text-slate-500">Illustrative preview</div>
          </div>
        </div>
        <div className="h-36 rounded-xl overflow-hidden relative bg-[#dbeafe]">
          <svg viewBox="0 0 180 144" className="w-full h-full" aria-hidden="true">
            <rect width="180" height="144" fill="#dbeafe" />
            <path d="M0 40h180M0 90h180M40 0v144M110 0v144" stroke="#bfdbfe" strokeWidth="8" />
            <path d="M20 110 C 50 90, 80 40, 150 30" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="6 6" />
            <circle cx="48" cy="96" r="7" fill="#2563eb" />
            <circle cx="132" cy="38" r="6" fill="#2563eb" />
            <circle cx="90" cy="64" r="9" fill="#1d4ed8" />
          </svg>
          <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-white/95 border border-slate-200 px-2 py-1.5">
            <div className="text-[9px] font-semibold text-slate-500">Next Stop</div>
            <div className="text-[11px] font-bold text-slate-800">Academic Block</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const LandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <a
        href="#home"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <header
        className={`sticky top-0 z-50 transition-all duration-200 ${
          scrolled ? 'bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm' : 'bg-white/80 backdrop-blur-sm'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <BrandMark compact />

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-500" aria-label="Primary">
            {NAV_LINKS.map((item, index) => (
              <a
                key={`${item.label}-${index}`}
                href={item.href}
                className={`hover:text-slate-900 transition-colors cursor-pointer ${
                  item.label === 'Home' ? 'text-blue-600 relative after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:bg-blue-600 after:rounded-full' : ''
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/roles"
              className="min-h-11 px-4 inline-flex items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Login
            </Link>
            <Link
              to="/roles?mode=register"
              className="min-h-11 px-5 inline-flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Sign Up
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-4 space-y-2">
            {NAV_LINKS.map((item, index) => (
              <a
                key={`m-${item.label}-${index}`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block min-h-11 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link
                to="/roles"
                className="flex-1 min-h-11 inline-flex items-center justify-center rounded-full border border-slate-200 text-sm font-semibold"
                onClick={() => setMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                to="/roles?mode=register"
                className="flex-1 min-h-11 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-sm font-semibold"
                onClick={() => setMenuOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section id="home" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.10),_transparent_55%)] pointer-events-none" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 lg:pt-20 pb-16 lg:pb-24 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div className="landing-fade-up">
              <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1 text-[11px] sm:text-xs font-semibold text-blue-700">
                <span>Smart Transport</span>
                <span className="text-blue-300">·</span>
                <span>Safer Campus</span>
                <span className="text-blue-300">·</span>
                <span>Better Tomorrow</span>
              </div>
              <h1 className="mt-5 text-[2.35rem] sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08] text-slate-900">
                Your Campus
                <br />
                Bus, <span className="text-blue-600">Smarter</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-md leading-relaxed">
                Track buses in real-time, plan your journey, and travel across campus with ease. CampusBus brings your college transport system to your fingertips.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Link
                  to="/roles?mode=register"
                  className="min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-600/20 transition-colors cursor-pointer"
                >
                  Get Started <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/roles"
                  className="min-h-12 px-6 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer"
                >
                  View Routes
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Live Tracking</div>
                    <div className="text-xs text-slate-500">See buses in real-time</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Safe & Reliable</div>
                    <div className="text-xs text-slate-500">Verified drivers & routes</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Easy Access</div>
                    <div className="text-xs text-slate-500">Book & ride with ease</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative landing-fade-up-delay">
              <div className="absolute -inset-8 bg-blue-100/40 blur-3xl rounded-full pointer-events-none" />
              <div className="relative rounded-[2rem] overflow-hidden shadow-[0_24px_60px_-24px_rgba(37,99,235,0.45)] ring-1 ring-blue-100">
                <img
                  src="/images/campus-bus.jpg"
                  alt="Blue campus shuttle bus ready for student transport"
                  width={1600}
                  height={1000}
                  className="w-full h-auto object-cover aspect-[5/4] sm:aspect-[4/3]"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-900/35 to-transparent pointer-events-none" />
                <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-sm">
                  <span className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center">
                    <Bus className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-extrabold text-slate-900">CampusBus</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Why CampusBus?</h2>
              <p className="mt-3 text-slate-500 max-w-md">
                More than just a bus tracker — CampusBus is your complete campus transport companion.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <article
                      key={feature.title}
                      className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-slate-200 transition-all duration-200"
                    >
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${TONE_ICON[feature.tone]}`}>
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <h3 className="mt-4 font-bold text-slate-900">{feature.title}</h3>
                      <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{feature.body}</p>
                    </article>
                  );
                })}
              </div>
            </div>
            <AppPreview />
          </div>
        </section>

        <section id="about" className="py-16 sm:py-20 bg-[#f7f9fc]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">How It Works</h2>
              <p className="mt-3 text-slate-500">Get started in just a few simple steps.</p>
            </div>
            <ol className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="relative text-center px-4">
                    {index < STEPS.length - 1 && (
                      <span
                        className="hidden lg:block absolute top-8 left-[calc(50%+2.5rem)] right-[calc(-50%+2.5rem)] border-t border-dashed border-slate-300"
                        aria-hidden="true"
                      />
                    )}
                    <span className={`relative z-10 mx-auto w-16 h-16 rounded-full flex items-center justify-center ${TONE_ICON[step.tone]}`}>
                      <Icon className="w-7 h-7" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-bold text-slate-900">
                      {step.n}. {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-500">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section aria-label="Product highlights" className="border-y border-slate-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center gap-3 px-4 py-4 lg:py-2">
                  <Icon className="w-6 h-6 text-blue-600 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-extrabold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto relative overflow-hidden rounded-[1.75rem] bg-[#071433] text-white px-6 sm:px-12 py-12 sm:py-14">
            <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_right,_rgba(59,130,246,0.35),_transparent_55%)]" />
            <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <p className="text-[11px] font-bold tracking-[0.18em] text-blue-300 uppercase">Ready to ride?</p>
                <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">Join CampusBus Today</h2>
                <p className="mt-3 text-slate-300 max-w-xl">
                  Experience a smarter, safer and easier way to travel across campus.
                </p>
                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/roles?mode=register"
                    className="min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors cursor-pointer"
                  >
                    Get Started <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <a
                    href="#about"
                    className="min-h-12 px-6 inline-flex items-center justify-center rounded-full border border-white/25 hover:bg-white/10 text-white font-semibold transition-colors cursor-pointer"
                  >
                    Learn More
                  </a>
                </div>
              </div>
              <p className="font-[cursive] text-2xl sm:text-3xl text-sky-300/90 leading-tight text-right rotate-[-6deg]">
                Same Campus
                <br />
                Bigger Dreams
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#071433] text-slate-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div>
              <BrandMark light />
              <p className="mt-2 text-sm text-slate-400">Smart Campus. Connected.</p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium" aria-label="Footer">
              {NAV_LINKS.map((item, index) => (
                <a key={`f-${item.label}-${index}`} href={item.href} className="hover:text-white transition-colors cursor-pointer">
                  {item.label}
                </a>
              ))}
              <Link to="/roles" className="hover:text-white transition-colors cursor-pointer">
                Login
              </Link>
            </nav>
          </div>
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} CampusBus. All rights reserved.</p>
            <p>Campus bus tracking for students, drivers, and administrators.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
