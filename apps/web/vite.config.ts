import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where the dev server forwards `/api` and `/ws`; the built app is served by the server itself. */
const serverUrl = process.env.KRITZEL_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: true },
      '/ws': { target: serverUrl, ws: true, changeOrigin: true },
    },
  },
});
