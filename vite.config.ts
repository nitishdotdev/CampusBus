import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { assertViteV1ApiUrl } from './vite.v1-env.ts';

const VENDOR_CHUNKS: Record<string, string[]> = {
  'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
  'vendor-map':    ['leaflet', 'react-leaflet'],
  'vendor-socket': ['socket.io-client'],
  'vendor-lucide': ['lucide-react'],
};

export default defineConfig(() => {
  assertViteV1ApiUrl(process.env);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve('.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: ['.monkeycode-ai.live'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            for (const [chunk, pkgs] of Object.entries(VENDOR_CHUNKS)) {
              if (pkgs.some((p) => id.includes(`/node_modules/${p}/`))) return chunk;
            }
          },
        },
      },
    },
  };
});
