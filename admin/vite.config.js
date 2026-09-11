import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { cspPlugin } from './csp.js';

// Config is a function so we can read .env files: the dev port and the API the
// dev proxy forwards to are deployment details, not constants.
export default defineConfig(({ mode }) => {
  const envVars = loadEnv(mode, process.cwd(), '');
  const devPort = Number.parseInt(envVars.VITE_DEV_PORT, 10) || 5173;
  const apiPort = Number.parseInt(envVars.VITE_API_PORT, 10) || 5000;
  const apiTarget = envVars.VITE_API_PROXY_TARGET || `http://localhost:${apiPort}`;
  // Proxy whatever prefix the client actually calls, so changing the API
  // prefix in one place does not silently bypass the proxy.
  const apiPrefix = (envVars.VITE_API_PREFIX || '/api/v1').trim().replace(/\/+$/, '');
  const socketPath = (envVars.VITE_SOCKET_PATH || '/socket.io').trim().replace(/\/+$/, '');

  return {
    // The CSP is injected into the BUILT index.html only — the dev server needs
    // inline scripts and eval for hot reload. See csp.js.
    plugins: [react(), cspPlugin({ apiUrl: envVars.VITE_API_URL })],
    server: {
      port: devPort,
      open: true,
      // Proxy in dev so the browser sees one origin and the refresh cookie
      // behaves exactly as it will in production behind a single domain.
      proxy: {
        [apiPrefix]: {
          target: apiTarget,
          changeOrigin: true,
        },
        // The websocket goes the same way, so the panel stays single-origin in dev.
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
          // Split the heavy libraries so a code change does not bust the whole cache.
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
