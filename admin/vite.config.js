import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { cspPlugin } from './csp.js';

export default defineConfig(({ mode }) => {
  const envVars = loadEnv(mode, process.cwd(), '');
  const devPort = Number.parseInt(envVars.VITE_DEV_PORT, 10) || 5173;
  const apiPort = Number.parseInt(envVars.VITE_API_PORT, 10) || 5000;
  const apiTarget = envVars.VITE_API_PROXY_TARGET || `http://localhost:${apiPort}`;
  // Must match the prefix the client calls, or requests bypass the proxy.
  const apiPrefix = (envVars.VITE_API_PREFIX || '/api/v1').trim().replace(/\/+$/, '');
  const socketPath = (envVars.VITE_SOCKET_PATH || '/socket.io').trim().replace(/\/+$/, '');

  return {
    // CSP is added to the production build only; dev hot reload needs inline scripts.
    plugins: [react(), cspPlugin({ apiUrl: envVars.VITE_API_URL })],
    server: {
      port: devPort,
      open: true,
      // Proxy API and socket in dev so everything is same-origin, like production.
      proxy: {
        [apiPrefix]: {
          target: apiTarget,
          changeOrigin: true,
        },
        [socketPath]: {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Separate vendor chunks so app changes don't bust their cache.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            mui: ['@mui/material'],
            charts: ['recharts'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
  };
});
