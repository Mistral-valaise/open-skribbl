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
    for (const part of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'spec:coverage --strict']) {
      expect(check, part).toContain(part);
    }
    expect(ci).not.toContain('continue-on-error');
  });

  it('AC-012-13: the release workflow publishes amd64 and arm64 images to GHCR', () => {
    const release = read('.github/workflows/release.yml');
    expect(release).toContain('platforms: linux/amd64,linux/arm64');
    expect(release).toContain('ghcr.io/${{ github.repository }}');
    expect(release).toContain('push: true');
    expect(release).toContain('secrets.GITHUB_TOKEN');
  });

  it('AC-012-08: the image runs as a non-root user', () => {
    const dockerfile = read('Dockerfile');
    const lastUser = dockerfile.match(/^USER\s+(\S+)/gm)?.at(-1);
    expect(lastUser).toBe('USER node');
    expect(dockerfile).toContain('HEALTHCHECK');
  });
});
