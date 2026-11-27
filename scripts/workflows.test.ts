import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('workflows (spec 012)', () => {
  it('AC-012-12: CI runs the full check, the build and the end-to-end tests', () => {
    const ci = read('.github/workflows/ci.yml');
    const check = JSON.parse(read('package.json')).scripts.check as string;
    for (const step of ['pnpm check', 'pnpm build', 'pnpm e2e', '--frozen-lockfile']) {
      expect(ci, step).toContain(step);
    }
    // The image is built and played through in the workflow the release shares (spec 017).
    const imageTest = read('.github/workflows/image-test.yml');
    expect(ci).toContain('uses: ./.github/workflows/image-test.yml');
    expect(imageTest).toContain('docker build -t kritzel .');
    expect(imageTest).toContain('pnpm e2e');
    expect(imageTest).not.toContain('continue-on-error');
    for (const part of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'spec:coverage --strict']) {
      expect(check, part).toContain(part);
    }
    expect(ci).not.toContain('continue-on-error');
    // The observability stack is started the documented way and checked live (spec 015).
    expect(ci).toContain('pnpm obs:up');
    expect(ci).toContain('e2e/observability.spec.ts');
  });

  it('AC-012-13: the release workflow publishes amd64 and arm64 images to GHCR', () => {
    const release = read('.github/workflows/release.yml');
    expect(release).toContain('platforms: linux/amd64,linux/arm64');
    expect(release).toContain('push: true');
    // Pushed with the run's own token, to ghcr.io/<owner>/<repo> in lower case.
    expect(release).toContain('docker login ghcr.io');
    expect(release).toContain('${{ github.token }}');
    expect(read('scripts/release.mjs')).toContain('`ghcr.io/${repository.toLowerCase()}`');
    // An immutable tag per commit, and the version baked into the build (spec 017).
    expect(release).toContain(':sha-${{ github.sha }}');
    expect(release).toContain('KRITZEL_VERSION=');
    expect(read('Dockerfile')).toContain('ARG KRITZEL_VERSION');
  });

  it('AC-012-08: the image runs as a non-root user', () => {
    const dockerfile = read('Dockerfile');
    const lastUser = dockerfile.match(/^USER\s+(\S+)/gm)?.at(-1);
    expect(lastUser).toBe('USER node');
    expect(dockerfile).toContain('HEALTHCHECK');
  });

  it('AC-012-14: the load test is runnable and its result is recorded in the hosting guide', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts.loadtest).toContain('scripts/loadtest.mjs');
    const guide = read('docs/HOSTING.md');
    expect(guide).toContain('## Capacity');
    expect(guide).toMatch(/Dropped connections\s*\|\s*0/);
    expect(guide).toContain('1 CPU and 512 MB');
  });
});
