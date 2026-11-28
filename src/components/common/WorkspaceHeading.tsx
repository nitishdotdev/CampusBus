import type { ReactNode } from 'react';

export function WorkspaceHeading({ title, description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="campus-panel flex flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="campus-heading text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-[54ch] text-sm leading-relaxed text-slate-600">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
