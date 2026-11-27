#!/usr/bin/env node
// Generates the Prometheus rules for Kritzel's service level objectives from
// deploy/helm/kritzel/files/slo/kritzel.slo.yaml with Sloth (spec 015).
//
// Usage: node scripts/slo.mjs [--check]
//
// Sloth runs from a pinned container image, so everyone generates the same
// file. With --check nothing is written and the exit code is 1 when the
// committed rules differ from what the specification produces.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLOTH_IMAGE =
  'ghcr.io/slok/sloth:v0.16.0@sha256:f0f0075b0d45c1cf684e92947508cc1d5bf573925f785f803a439b2306c8b9a5';
const root = fileURLToPath(new URL('../deploy/helm/kritzel/files/', import.meta.url));
const spec = join(root, 'slo/kritzel.slo.yaml');
const rules = join(root, 'prometheus/rules/sloth-kritzel.yaml');
const check = process.argv.includes('--check');

// Sloth writes to stdout, so the container needs no writable mount and no
// particular user id.
const result = spawnSync(
  'docker',
  ['run', '--rm', '-i', SLOTH_IMAGE, 'generate', '--no-log', '-i', '/dev/stdin'],
  { input: readFileSync(spec), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'sloth failed');
  process.exit(result.status ?? 1);
}
const generated = result.stdout;

if (check) {
  let current = '';
  try {
    current = readFileSync(rules, 'utf8');
  } catch {
    // Missing counts as out of date.
  }
  if (current !== generated) {
    // Keep what Sloth produced for comparison.
    const dir = mkdtempSync(join(tmpdir(), 'kritzel-slo-'));
    writeFileSync(join(dir, 'sloth-kritzel.yaml'), generated);
    console.error(`SLO rules are out of date; run pnpm slo:generate (generated: ${dir})`);
    process.exit(1);
  }
  console.log('SLO rules are up to date.');
} else {
  writeFileSync(rules, generated);
  console.log(`wrote ${rules}`);
}
