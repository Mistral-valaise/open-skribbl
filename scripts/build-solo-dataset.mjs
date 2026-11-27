#!/usr/bin/env node
// Builds packages/content/solo/drawings/<file>.json from the Quick, Draw!
// dataset (CC BY 4.0, https://github.com/googlecreativelab/quickdraw-dataset).
//
// For every category in packages/content/solo/categories.json it downloads the
// beginning of the category's "simplified" file and keeps the first drawings
// that the dataset marks as recognised and that are neither trivial nor huge.
// The output is committed, so builds need no network (docs/adr/0005).
//
// Usage: node scripts/build-solo-dataset.mjs [--force] [--only <file>]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const soloDir = join(root, 'packages/content/solo');
const outDir = join(soloDir, 'drawings');

const SOURCE = 'https://storage.googleapis.com/quickdraw_dataset/full/simplified';
const DRAWINGS_PER_CATEGORY = 16;
const BYTES_PER_REQUEST = 600_000;
const MIN_STROKES = 2;
const MAX_STROKES = 20;
const MIN_POINTS = 12;
const MAX_POINTS = 220;
const CONCURRENCY = 6;

const force = process.argv.includes('--force');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

/** Dataset stroke [[x…], [y…]] → flat [x, y, x, y, …]. */
function flatten([xs, ys]) {
  return xs.flatMap((x, index) => [x, ys[index]]);
}

function pick(lines) {
  const drawings = [];
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry.recognized) continue;
    const strokes = entry.drawing.map(flatten);
    const points = strokes.reduce((sum, stroke) => sum + stroke.length / 2, 0);
    if (strokes.length < MIN_STROKES || strokes.length > MAX_STROKES) continue;
    if (points < MIN_POINTS || points > MAX_POINTS) continue;
    drawings.push(strokes);
    if (drawings.length === DRAWINGS_PER_CATEGORY) break;
  }
  return drawings;
}

async function build(category) {
  const target = join(outDir, `${category.file}.json`);
  if (!force && existsSync(target)) return 'kept';
  const response = await fetch(`${SOURCE}/${encodeURIComponent(category.id)}.ndjson`, {
    headers: { Range: `bytes=0-${BYTES_PER_REQUEST - 1}` },
  });
  if (!response.ok) throw new Error(`${category.id}: HTTP ${response.status}`);
  const lines = (await response.text()).split('\n');
  lines.pop(); // the last line is cut off by the byte range
  const drawings = pick(lines);
  if (drawings.length < DRAWINGS_PER_CATEGORY) {
    throw new Error(`${category.id}: only ${drawings.length} usable drawings in the first chunk`);
  }
  writeFileSync(target, JSON.stringify(drawings) + '\n');
  return 'built';
}

const categories = JSON.parse(readFileSync(join(soloDir, 'categories.json'), 'utf8')).filter(
  (category) => !only || category.file === only,
);
mkdirSync(outDir, { recursive: true });

const queue = [...categories];
const failures = [];
let built = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let category = queue.shift(); category; category = queue.shift()) {
      try {
        if ((await build(category)) === 'built') built += 1;
      } catch (error) {
        failures.push(error.message);
      }
    }
  }),
);

console.log(
  `${built} built, ${categories.length - built - failures.length} kept, ${failures.length} failed`,
);
for (const failure of failures) console.log(`  - ${failure}`);
if (failures.length > 0) process.exit(1);
