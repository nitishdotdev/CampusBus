import React from 'react';
import { Link } from 'react-router-dom';
import { Bus } from 'lucide-react';

export const BrandMark: React.FC<{ light?: boolean; compact?: boolean }> = ({
  light = false,
  compact = false,
}) => (
  <Link to="/" className="inline-flex items-center gap-2.5 min-h-11 cursor-pointer group">
    <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition-colors">
      <Bus className="w-5 h-5" aria-hidden="true" />
    </span>
    <span className={`font-extrabold tracking-tight ${compact ? 'text-lg' : 'text-xl'} ${light ? 'text-white' : 'text-slate-900'}`}>
      Campus<span className={light ? 'text-blue-300' : 'text-blue-600'}>Bus</span>
    </span>
  </Link>
);
