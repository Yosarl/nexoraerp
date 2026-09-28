import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    electron({
      main: {
        // Main process entry file
        entry: 'electron/main.ts',
      },
      preload: {
        // Preload scripts entry
        input: 'electron/preload.ts',
      },
      // Enable use of Node.js API in the Renderer process
      renderer: {},
    }),
  ],
  // Use '/' for static deployment (e.g. Render); './' for Electron
  base: process.env.VITE_BASE_PATH || './',
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
}));
