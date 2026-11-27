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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? 4000}`;
  return {
    plugins: [react(), campusBusV1EnvPlugin()],
    resolve: {
      alias: { '@': path.resolve('.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/socket.io': {
          target,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      target: 'chrome109',
      cssTarget: 'chrome109',
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
