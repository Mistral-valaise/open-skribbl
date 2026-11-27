#!/usr/bin/env node
// Reports which acceptance criteria (docs/specs) are cited by tests.
// Usage: node scripts/spec-coverage.mjs [--strict]
// See docs/specs/README.md for the conventions this tool enforces.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const strict = process.argv.includes('--strict');

const SPEC_DIR = join(root, 'docs/specs');
const TEST_ROOTS = ['apps', 'packages', 'e2e'].map((dir) => join(root, dir));
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|js|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
const AC_ID = /AC-\d{3}-\d{2}/g;
const AC_DEFINITION = /^- \*\*(AC-\d{3}-\d{2})\*\*/;

function walk(dir, keep, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, keep, found);
    else if (keep(path)) found.push(path);
  }
  return found;
}

function readSpecs() {
  const files = walk(SPEC_DIR, (path) => /\/\d{3}-[^/]+\.md$/.test(path)).sort();
  return files.map((file) => {
    const text = readFileSync(file, 'utf8');
    const status = /^\|\s*Status\s*\|\s*(\w+)\s*\|/m.exec(text)?.[1] ?? 'Unknown';
    const criteria = text
      .split('\n')
      .map((line) => AC_DEFINITION.exec(line)?.[1])
      .filter(Boolean);
    return { file: relative(root, file), status, criteria };
  });
}

function readCitations() {
  const citations = new Map();
  for (const file of TEST_ROOTS.flatMap((dir) => walk(dir, (path) => TEST_FILE.test(path)))) {
    for (const id of readFileSync(file, 'utf8').match(AC_ID) ?? []) {
      if (!citations.has(id)) citations.set(id, new Set());
      citations.get(id).add(relative(root, file));
    }
  }
  return citations;
}

const specs = readSpecs();
const citations = readCitations();
const known = new Set(specs.flatMap((spec) => spec.criteria));
const problems = [];

const duplicates = specs
  .flatMap((spec) => spec.criteria)
  .filter((id, index, all) => all.indexOf(id) !== index);
for (const id of new Set(duplicates)) problems.push(`${id} is defined more than once`);

let total = 0;
let covered = 0;
console.log('Spec coverage\n');
for (const spec of specs) {
  const uncovered = spec.criteria.filter((id) => !citations.has(id));
  const hit = spec.criteria.length - uncovered.length;
  total += spec.criteria.length;
  covered += hit;
  const count = `${hit}/${spec.criteria.length}`.padStart(7);
  console.log(`${count}  ${spec.status.padEnd(11)}  ${spec.file}`);
  if (spec.status === 'Implemented') {
    for (const id of uncovered) problems.push(`${id} has no test, but ${spec.file} is Implemented`);
  }
}
console.log(`\n${covered}/${total} acceptance criteria are cited by at least one test.`);

for (const [id, files] of citations) {
  if (!known.has(id))
    problems.push(`${id} is cited in ${[...files].join(', ')} but defined in no spec`);
}

if (problems.length > 0) {
  console.log('\nProblems:');
  for (const problem of problems) console.log(`  - ${problem}`);
  if (strict) process.exit(1);
}
