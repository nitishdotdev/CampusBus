import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { assertProductionV1Env } from './src/services/v1/apiBase.ts';

function campusBusV1EnvPlugin(): Plugin {
  return {
    name: 'campusbus-v1-env',
    config(_userConfig, { command, mode }) {
      if (command !== 'build' || mode !== 'production') return;
      const env = loadEnv(mode, process.cwd(), '');
      assertProductionV1Env({
        VITE_USE_V1_API: process.env.VITE_USE_V1_API ?? env.VITE_USE_V1_API,
        VITE_API_V1_URL: process.env.VITE_API_V1_URL ?? env.VITE_API_V1_URL,
        NODE_ENV: 'production',
        PROD: true,
      });
    },
  };
}

const VENDOR_CHUNKS: Record<string, string[]> = {
  'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
  'vendor-map':    ['leaflet', 'react-leaflet'],
  'vendor-socket': ['socket.io-client'],
  'vendor-lucide': ['lucide-react'],
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), campusBusV1EnvPlugin()],
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
