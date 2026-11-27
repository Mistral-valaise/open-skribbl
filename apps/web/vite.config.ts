import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where the dev server forwards `/api` and `/ws`; the built app is served by the server itself. */
const serverUrl = process.env.KRITZEL_SERVER_URL ?? 'http://localhost:3000';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The home screen's footer shows the version (docs/DESIGN.md §9).
  define: { __APP_VERSION__: JSON.stringify(version) },
  // No asset becomes a `data:` URI: the server's Content-Security-Policy allows fonts from 'self' only.
  build: { assetsInlineLimit: 0 },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: true },
      '/ws': { target: serverUrl, ws: true, changeOrigin: true },
    },
  },
});
