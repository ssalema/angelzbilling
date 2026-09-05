import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Config is a function so we can read .env files: the dev port and the API the
// dev proxy forwards to are deployment details, not constants.
export default defineConfig(({ mode }) => {
  const envVars = loadEnv(mode, process.cwd(), '');
  const devPort = Number.parseInt(envVars.VITE_DEV_PORT, 10) || 5173;
  const apiTarget = envVars.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), 'src') },
    },
    server: {
      port: devPort,
      open: true,
      // Proxy in dev so the browser sees one origin and the refresh cookie
      // behaves exactly as it will in production behind a single domain.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
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
            mui: ['@mui/material', '@mui/icons-material'],
            charts: ['recharts'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
  };
});
