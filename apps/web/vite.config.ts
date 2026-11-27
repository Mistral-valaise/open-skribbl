import { cpSync, createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Where the dev server forwards `/api` and `/ws`; the built app is served by the server itself. */
const serverUrl = process.env.KRITZEL_SERVER_URL ?? 'http://localhost:3000';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

/**
 * Serves the solo dataset under `/content/solo/` (spec 009): straight from
 * `packages/content/solo` in development, copied into the build output for
 * production. The files exist once in the repository.
 */
function soloContent(): Plugin {
  const source = fileURLToPath(new URL('../../packages/content/solo', import.meta.url));
  const route = '/content/solo/';
  let outDir = '';
  let building = false;
  return {
    name: 'kritzel-solo-content',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      building = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
        if (!path.startsWith(route)) return next();
        const file = normalize(join(source, path.slice(route.length)));
        const inside = file.startsWith(source + sep) && file.endsWith('.json');
        if (!inside || !existsSync(file)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader('content-type', 'application/json; charset=utf-8');
        createReadStream(file).pipe(response);
      });
    },
    closeBundle() {
      if (building) cpSync(source, join(outDir, 'content', 'solo'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), soloContent()],
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
