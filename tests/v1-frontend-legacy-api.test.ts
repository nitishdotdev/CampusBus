import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../src/', import.meta.url).pathname;
const LEGACY_RESOURCE = /['"`](\/api\/(?:routes|alerts|notifications|buses|trips|users|schedules)[^'"`]*)['"`]/g;
const V1_DIR = `${join(SRC, 'services', 'v1')}/`;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function leftoverPaths(src: string): string[] {
  return [...src.matchAll(LEGACY_RESOURCE)].map((m) => m[1]!);
}

describe('production frontend V1 resources', () => {
  it('does not call leftover /api/routes|alerts|notifications|buses|trips|users|schedules except via /api/v1/', () => {
    const hits: { file: string; paths: string[] }[] = [];
    for (const file of walk(SRC)) {
      if (file.startsWith(V1_DIR)) continue;
      const src = readFileSync(file, 'utf8');
      const paths = leftoverPaths(src);
      if (paths.length === 0) continue;
      if (!src.includes('USE_V1')) {
        hits.push({ file: relative(SRC, file), paths });
      }
    }
    expect(hits).toEqual([]);
  });

  it('does not request leftover /api/schedules from student and admin schedule views', () => {
    const files = [
      'pages/student/StudentDashboard.tsx',
      'pages/student/StudentSchedules.tsx',
      'pages/admin/AdminSchedules.tsx',
    ];
    for (const rel of files) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(leftoverPaths(src), rel).toEqual([]);
    }
  });
});
