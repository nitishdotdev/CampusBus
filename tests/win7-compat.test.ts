import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const loginPage = readFileSync(new URL('../src/pages/auth/LoginPage.tsx', import.meta.url), 'utf8');
const rolePage = readFileSync(new URL('../src/pages/auth/RoleSelectPage.tsx', import.meta.url), 'utf8');
const postcssPath = new URL('../postcss.config.js', import.meta.url);
const tailwindPath = new URL('../tailwind.config.js', import.meta.url);

describe('Windows 7 / Chrome 109 compatibility', () => {
  it('uses Tailwind CSS 3.4.x instead of Tailwind 4 and the v4 Vite plugin', () => {
    expect(pkg.dependencies?.['@tailwindcss/vite']).toBeUndefined();
    expect(pkg.devDependencies?.['@tailwindcss/vite']).toBeUndefined();
    const tw = pkg.devDependencies?.tailwindcss ?? pkg.dependencies?.tailwindcss;
    expect(tw).toMatch(/^[\^~]?3\.4\./);
    expect(pkg.devDependencies?.autoprefixer ?? pkg.dependencies?.autoprefixer).toBeTruthy();
    expect(pkg.devDependencies?.postcss ?? pkg.dependencies?.postcss).toBeTruthy();
  });

  it('configures PostCSS and Tailwind v3 instead of @tailwindcss/vite', () => {
    expect(viteConfig).not.toMatch(/@tailwindcss\/vite/);
    expect(existsSync(postcssPath)).toBe(true);
    expect(existsSync(tailwindPath)).toBe(true);
    const postcss = readFileSync(postcssPath, 'utf8');
    const tailwind = readFileSync(tailwindPath, 'utf8');
    expect(postcss).toMatch(/tailwindcss/);
    expect(postcss).toMatch(/autoprefixer/);
    expect(tailwind).toMatch(/content\s*:/);
    expect(indexCss).toMatch(/@tailwind base;/);
    expect(indexCss).toMatch(/@tailwind components;/);
    expect(indexCss).toMatch(/@tailwind utilities;/);
    expect(indexCss).not.toMatch(/@import\s+["']tailwindcss["']/);
    expect(indexCss).not.toMatch(/@theme/);
  });

  it('sets Vite production JS and CSS targets to chrome109', () => {
    expect(viteConfig).toMatch(/target\s*:\s*['"]chrome109['"]/);
    expect(viteConfig).toMatch(/cssTarget\s*:\s*['"]chrome109['"]/);
  });

  it('does not rely on dvh units in authentication pages', () => {
    expect(loginPage).not.toMatch(/\bdvh\b/);
    expect(rolePage).not.toMatch(/\bdvh\b/);
    expect(loginPage).toMatch(/min-h-screen|min-h-\[100vh\]|min-h-full/);
  });
});
