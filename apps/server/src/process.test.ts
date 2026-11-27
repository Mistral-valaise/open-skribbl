import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const tsx = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));

interface Running {
  child: ChildProcess;
  output: () => string;
  exit: Promise<number | null>;
}

function start(env: Record<string, string>): Running {
  const child = spawn(tsx, ['src/main.ts'], {
    cwd: serverDir,
    env: { ...process.env, HOST: '127.0.0.1', ...env },
  });
  let text = '';
  child.stdout.on('data', (chunk) => (text += String(chunk)));
  child.stderr.on('data', (chunk) => (text += String(chunk)));
  const exit = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, output: () => text, exit };
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('server process (spec 012)', () => {
  let running: Running | undefined;
  afterEach(() => {
    running?.child.kill('SIGKILL');
  });

  it('AC-012-02, AC-012-11: listens on PORT and stops with exit code 0 on SIGTERM', async () => {
    running = start({ PORT: '38471' });
    await waitFor(() => running!.output().includes('"listening"'), 'start-up');
    const response = await fetch('http://127.0.0.1:38471/healthz');
    expect(await response.json()).toEqual({ status: 'ok' });

    const stoppedAt = Date.now();
    running.child.kill('SIGTERM');
    expect(await running.exit).toBe(0);
    expect(Date.now() - stoppedAt).toBeLessThan(10_000);
    expect(running.output()).toContain('"shutting down"');
  }, 30_000);

  it('AC-012-04: an invalid PORT exits non-zero and names the variable', async () => {
    running = start({ PORT: 'abc' });
    expect(await running.exit).not.toBe(0);
    expect(running.output()).toContain('PORT');
  }, 30_000);
});
