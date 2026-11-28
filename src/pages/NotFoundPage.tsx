import React from 'react';
import { Link } from 'react-router-dom';

/** Shown for any address the app does not define. The URL is left as typed. */
export function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <section className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="text-slate-600">The address you opened does not exist, or the page has moved.</p>
        <nav aria-label="Recovery links" className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="min-h-11 inline-flex items-center rounded-xl px-4 font-semibold underline">Go to the home page</Link>
          <Link to="/login" className="min-h-11 inline-flex items-center rounded-xl px-4 font-semibold underline">Sign in</Link>
        </nav>
      </section>
    </main>
  );
}
