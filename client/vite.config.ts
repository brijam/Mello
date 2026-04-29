/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:2999',
      '/uploads': 'http://localhost:2999',
      '/socket.io': {
        target: 'http://localhost:2999',
        ws: true,
      },
    },
  },
});
