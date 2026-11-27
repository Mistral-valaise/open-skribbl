// Bundles the server and its dependencies into dist/main.js and copies the
// word lists next to it, so the runtime image needs no node_modules.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Dependencies written as CommonJS call require(); provide it in the ESM bundle.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // Optional native accelerators of `ws`; it falls back to JavaScript without them.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});
cpSync('../../packages/content/words', 'dist/words', { recursive: true });
