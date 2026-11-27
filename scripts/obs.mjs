#!/usr/bin/env node
// Starts, stops and wipes the local observability stack (spec 015).
//
// Usage: node scripts/obs.mjs up | down | reset | status
//
// `up` creates .env.observability with a random Grafana admin password on
// first use (the file is ignored by git and never printed), starts the game
// with telemetry plus collector, Prometheus, Loki, Tempo and Grafana, and
// waits until Grafana reports every data source healthy.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = fileURLToPath(new URL('../.env.observability', import.meta.url));
const GRAFANA = process.env.KRITZEL_GRAFANA_URL ?? 'http://127.0.0.1:3001';
const DATASOURCES = ['prometheus', 'loki', 'tempo'];

function compose(...args) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.observability.yml',
      ...args,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureEnvFile() {
  if (existsSync(envFile)) return;
  writeFileSync(envFile, `GRAFANA_ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\n`, {
    mode: 0o600,
  });
  chmodSync(envFile, 0o600);
  console.log('Created .env.observability with a generated Grafana admin password.');
}

function adminPassword() {
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('GRAFANA_ADMIN_PASSWORD='));
  return line?.slice('GRAFANA_ADMIN_PASSWORD='.length) ?? '';
}

async function health() {
  const authorization = `Basic ${Buffer.from(`admin:${adminPassword()}`).toString('base64')}`;
  const states = {};
  for (const uid of DATASOURCES) {
    try {
      const response = await fetch(`${GRAFANA}/api/datasources/uid/${uid}/health`, {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
      });
      states[uid] = response.ok ? (await response.json()).status : `HTTP ${response.status}`;
    } catch {
      states[uid] = 'unreachable';
    }
  }
  return states;
}

async function waitUntilHealthy(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let states = {};
  while (Date.now() < deadline) {
    states = await health();
    if (DATASOURCES.every((uid) => states[uid] === 'OK')) return states;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.error('The stack did not become healthy:', states);
  process.exit(1);
}

const command = process.argv[2];
if (command === 'up') {
  ensureEnvFile();
  compose('up', '-d', '--build', '--wait-timeout', '120');
  console.log('Waiting for Grafana and its data sources…');
  console.log(await waitUntilHealthy());
  console.log(`Game:    http://127.0.0.1:3000`);
  console.log(`Grafana: ${GRAFANA} (user admin, password in .env.observability)`);
} else if (command === 'down') {
  ensureEnvFile();
  compose('down');
} else if (command === 'reset') {
  ensureEnvFile();
  compose('down', '--volumes');
} else if (command === 'status') {
  ensureEnvFile();
  compose('ps');
  console.log(await health());
} else {
  console.error('Usage: node scripts/obs.mjs up | down | reset | status');
  process.exit(2);
}
