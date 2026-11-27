// Bundles the server and the traffic generator with their dependencies into dist/ and copies the
// word lists next to it, so the runtime image needs no node_modules.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

// Set by the image build; falls back to the workspace version.
const version =
  process.env.KRITZEL_VERSION ||
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

rmSync('dist', { recursive: true, force: true });
const shared = {
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
};
await build({
  ...shared,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  define: { __KRITZEL_VERSION__: JSON.stringify(version) },
});
// The traffic generator ships next to the server (spec 015, "Synthetic traffic").
await build({ ...shared, entryPoints: ['src/traffic/main.ts'], outfile: 'dist/traffic.js' });
cpSync('../../packages/content/words', 'dist/words', { recursive: true });
