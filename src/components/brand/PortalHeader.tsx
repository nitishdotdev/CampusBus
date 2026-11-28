import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function PortalHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <BrandMark compact />
        {children}
      </div>
    </header>
  );
}
