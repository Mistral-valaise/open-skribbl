import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { changelogSection, escapeRegExp, pinChartImage, plan, releaseNotes } from './release.mjs';

/**
 * Tests of the release process and the supply-chain rules (spec 017). The
 * decisions of the release are functions of `scripts/release.mjs` and are
 * called directly; the workflows are read from their YAML. No registry is
 * contacted and nothing is published.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const WORKFLOWS = '.github/workflows/';
const workflowFiles = readdirSync(`${root}${WORKFLOWS}`).filter((file) => /\.ya?ml$/.test(file));
const text = (file: string) => read(`${WORKFLOWS}${file}`);
const load = (file: string) => parse(text(file)) as Workflow;

const release = load('release.yml');
const ci = load('ci.yml');
const imageTest = load('image-test.yml');
const security = load('security.yml');

const needs = (job: Job) => [job.needs ?? []].flat();
const runs = (job: Job) => (job.steps ?? []).map((step) => step.run ?? '').join('\n');
const uses = (job: Job) => (job.steps ?? []).map((step) => step.uses ?? '');
const IMAGE_TEST = './.github/workflows/image-test.yml';
const DIGEST = `sha256:${'b'.repeat(64)}`;
const SHA = '3f2a9c1d5e6f708192a3b4c5d6e7f8091a2b3c4d';

/** Runs a script with a `docker` that only records how it was called. */
function withFakeDocker(script: string, args: string[], env: Record<string, string> = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'kritzel-fake-docker-'));
  writeFileSync(
    join(bin, 'docker'),
    '#!/bin/sh\nprintf "%s\\n" "$@"\nexit "${FAKE_DOCKER_EXIT:-0}"\n',
  );
  chmodSync(join(bin, 'docker'), 0o755);
  const result = spawnSync('bash', [`${root}${script}`, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
  return {
    status: result.status,
    args: result.stdout.split('\n'),
    output: result.stdout + result.stderr,
  };
}

describe('build once (spec 017)', () => {
  const build = release.jobs.build!;
  const step = build.steps!.find((candidate) =>
    candidate.uses?.startsWith('docker/build-push-action@'),
  )!;

  it('AC-017-01: main builds both platforms once, with SBOM and provenance, as sha-<commit> only', () => {
    expect(release.on.push).toEqual({ branches: ['main'], tags: ['v*'] });
    expect(build.if).toBe("github.ref_type == 'branch'");
    expect(
      uses(build).filter((action) => action.startsWith('docker/build-push-action@')),
    ).toHaveLength(1);
    expect(step.with).toMatchObject({
      platforms: 'linux/amd64,linux/arm64',
      push: true,
      sbom: true,
      provenance: 'mode=max',
      tags: '${{ needs.plan.outputs.image }}:sha-${{ github.sha }}',
    });
    // No other job of any workflow pushes an image.
    for (const file of workflowFiles) {
      for (const [name, job] of Object.entries(load(file).jobs)) {
        if (file === 'release.yml' && name === 'build') continue;
        expect(uses(job).join(' '), `${file} ${name}`).not.toContain('docker/build-push-action');
        expect(runs(job), `${file} ${name}`).not.toMatch(/docker (buildx build|push)\b/);
      }
    }
  });

  it('AC-017-02: the image is built with the version and the short commit', () => {
    const planned = plan({
      refType: 'branch',
      refName: 'main',
      sha: SHA,
      repository: 'Mistral-valaise/open-skribbl',
      version: '1.2.3',
    });
    expect(planned.buildVersion).toBe('1.2.3+3f2a9c1');
    expect(planned.image).toBe('ghcr.io/mistral-valaise/open-skribbl');
    expect(String(step.with!['build-args'])).toContain(
      'KRITZEL_VERSION=${{ needs.plan.outputs.build_version }}',
    );
    expect(release.jobs.plan!.outputs!.build_version).toBe(
      '${{ steps.plan.outputs.build_version }}',
    );
    expect(read('Dockerfile')).toContain('ARG KRITZEL_VERSION');
  });

  it('AC-017-26: the runtime stage removes the package managers of the base image', () => {
    const runtime = read('Dockerfile')
      .split(/^FROM /m)
      .at(-1)!;
    const removal = /^RUN rm -rf ((?:.*\\\n)*.*)/m.exec(runtime)?.[1] ?? '';
    for (const path of [
      '/usr/local/lib/node_modules',
      '/opt/yarn-*',
      '/usr/local/bin/npm',
      '/usr/local/bin/npx',
      '/usr/local/bin/corepack',
      '/usr/local/bin/yarn',
      '/usr/local/bin/yarnpkg',
    ]) {
      expect(removal.split(/[\s\\]+/), path).toContain(path);
    }
    // It runs as root, before the image drops to the unprivileged user.
    expect(runtime.indexOf('RUN rm -rf')).toBeLessThan(runtime.indexOf('USER node'));
  });
});

describe('checks on the digest (spec 017)', () => {
  const digest = '${{ needs.build.outputs.digest || needs.plan.outputs.digest }}';

  it('AC-017-03: the image tests are one reusable workflow, called by CI and by the release', () => {
    expect(imageTest.on).toEqual({
      workflow_call: {
        inputs: {
          image: expect.objectContaining({ type: 'string', required: false, default: '' }),
        },
      },
    });
    const steps = imageTest.jobs.test!.steps!;
    const e2e = steps.filter((step) => step.run?.startsWith('pnpm e2e'));
    expect(e2e.map((step) => step.env!.KRITZEL_E2E_URL)).toEqual([
      'http://127.0.0.1:3000',
      'https://localhost:8443',
    ]);
    // Without an image it builds the README quick start; with one it pulls exactly that.
    expect(steps.find((step) => step.run === 'docker build -t kritzel .')!.if).toBe(
      "inputs.image == ''",
    );
    expect(steps.find((step) => step.run?.includes('docker pull "$IMAGE"'))!.if).toBe(
      "inputs.image != ''",
    );
    expect(runs(imageTest.jobs.test!)).toContain(
      'docker run -d --name kritzel -p 3000:3000 "$IMAGE"',
    );

    expect(ci.jobs.container).toEqual({ uses: IMAGE_TEST });
    expect(release.jobs.test!.uses).toBe(IMAGE_TEST);
    expect(release.jobs.test!.with).toEqual({
      image: `\${{ needs.plan.outputs.image }}@${digest}`,
    });
    // Defined once: neither caller repeats the steps.
    for (const file of ['ci.yml', 'release.yml'])
      expect(text(file)).not.toContain('KRITZEL_E2E_URL');
  });

  it('AC-017-04: the scan fails on fixable critical and high vulnerabilities of the digest', () => {
    const scan = withFakeDocker('scripts/scan-image.sh', [`ghcr.io/owner/repo@${DIGEST}`]);
    expect(scan.status, scan.output).toBe(0);
    const line = scan.args.join(' ');
    expect(line).toMatch(/ image .*--scanners vuln/);
    expect(line).toContain('--severity CRITICAL,HIGH');
    expect(line).toContain('--ignore-unfixed');
    expect(line).toContain('--exit-code 1');
    expect(line).toContain('--ignorefile /work/.trivyignore');
    expect(line).toContain('--platform linux/amd64');
    expect(line).toContain('--platform linux/arm64');
    expect(scan.args.filter((arg) => arg === `ghcr.io/owner/repo@${DIGEST}`)).toHaveLength(2);
    // A finding is Trivy's exit code, and the script passes it on.
    const failing = withFakeDocker('scripts/scan-image.sh', ['kritzel'], { FAKE_DOCKER_EXIT: '1' });
    expect(failing.status).toBe(1);
    expect(withFakeDocker('scripts/scan-image.sh', []).status).not.toBe(0);

    const job = release.jobs.scan!;
    expect(job.if).toBe(release.jobs.test!.if);
    const step = job.steps!.find((candidate) => candidate.run?.includes('scripts/scan-image.sh'))!;
    expect(step.run).toContain('scripts/scan-image.sh "$IMAGE@$DIGEST"');
    expect(step.env).toMatchObject({ IMAGE: '${{ needs.plan.outputs.image }}', DIGEST: digest });
    expect(text('release.yml')).not.toContain('continue-on-error');
  });

  it('AC-017-05: every scan exception has a reason and an expiry date', () => {
    const lines = read('.trivyignore').split('\n');
    lines.forEach((line, index) => {
      if (line.trim() === '' || line.startsWith('#')) return;
      expect(line, line).toMatch(/^(CVE-\d{4}-\d+|GHSA(-[0-9a-z]{4}){3}) exp:\d{4}-\d{2}-\d{2}$/);
      expect(lines[index - 1], `reason above ${line}`).toMatch(/^# \S.{15,}/);
    });
    // The rule is written where the next exception will be added.
    expect(lines[0]).toMatch(/^#/);
    expect(read('.trivyignore')).toContain('exp:YYYY-MM-DD');
  });

  it('AC-017-06: the digest is signed keyless, only after the tests and the scan', () => {
    const sign = release.jobs.sign!;
    expect(needs(sign)).toEqual(expect.arrayContaining(['test', 'scan']));
    expect(sign.if).toBe(
      "${{ !cancelled() && needs.test.result == 'success' && needs.scan.result == 'success' }}",
    );
    expect(uses(sign).some((action) => action.startsWith('sigstore/cosign-installer@'))).toBe(true);
    expect(runs(sign)).toContain('cosign sign --yes "$IMAGE@$DIGEST"');
    // The run proves that the documented command accepts what it just signed.
    expect(runs(sign)).toMatch(
      /cosign verify "\$IMAGE@\$DIGEST"[\s\S]*--certificate-oidc-issuer https:\/\/token\.actions\.githubusercontent\.com[\s\S]*--certificate-identity "\$GITHUB_SERVER_URL\/\$GITHUB_WORKFLOW_REF"/,
    );
    // Keyless: no key, no password, no secret other than the run's own token.
    expect(runs(sign)).not.toMatch(/--key\b|COSIGN_PASSWORD|COSIGN_PRIVATE_KEY/);
    expect(text('release.yml').match(/secrets\.\w+/g) ?? []).toEqual([]);
    const attest = sign.steps!.find((step) =>
      step.uses?.startsWith('actions/attest-build-provenance@'),
    )!;
    expect(attest.with).toMatchObject({
      'subject-name': '${{ needs.plan.outputs.image }}',
      'subject-digest': digest,
      'push-to-registry': true,
    });

    // Only the signing job may ask for an identity token or write attestations.
    for (const file of workflowFiles) {
      const workflow = load(file);
      for (const scope of ['id-token', 'attestations']) {
        expect(workflow.permissions?.[scope], `${file} ${scope}`).toBeUndefined();
        for (const [name, job] of Object.entries(workflow.jobs)) {
          if (file === 'release.yml' && name === 'sign') continue;
          expect(job.permissions?.[scope], `${file} ${name} ${scope}`).toBeUndefined();
        }
      }
    }
  });
});

describe('promotion (spec 017)', () => {
  const promote = release.jobs.promote!;

  it('AC-017-07: tags are set on the digest after signing, without a build, and checked', () => {
    expect(needs(promote)).toContain('sign');
    expect(promote.if).toBe("${{ !cancelled() && needs.sign.result == 'success' }}");
    const script = runs(promote);
    expect(script).toContain('docker buildx imagetools create "${tags[@]}" "$IMAGE@$DIGEST"');
    expect(script).toMatch(/imagetools inspect "\$IMAGE:\$tag"/);
    expect(script).toMatch(/\[ "\$actual" = "\$DIGEST" \]/);
    expect(uses(promote).join(' ')).not.toMatch(/build-push-action|setup-qemu-action/);
    // Nothing between the build and the promotion pushes a moving tag.
    for (const name of ['plan', 'build', 'scan', 'sign']) {
      expect(runs(release.jobs[name]!), name).not.toContain('imagetools create');
    }
  });

  it('AC-017-08: main plans edge, a version tag plans the version, the minor and latest', () => {
    const base = { sha: SHA, repository: 'owner/repo', version: '1.2.3' };
    const main = plan({ ...base, refType: 'branch', refName: 'main' });
    expect(main).toMatchObject({ tags: ['edge'], release: false });
    const tag = plan({ ...base, refType: 'tag', refName: 'v1.2.3' });
    expect(tag).toMatchObject({
      tags: ['1.2.3', '1.2', 'latest'],
      release: true,
      version: '1.2.3',
    });
    expect(() => plan({ ...base, refType: 'branch', refName: 'feature' })).toThrow(/main/);
    expect(promote.steps!.at(-1)!.env).toMatchObject({ TAGS: '${{ needs.plan.outputs.tags }}' });
  });

  it('AC-017-09: edge moves only while the commit is the head of main', () => {
    const script = runs(promote);
    expect(script).toContain('gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main"');
    expect(script).toMatch(/if \[ "\$head" != "\$GITHUB_SHA" \]; then[\s\S]*?exit 0/);
    expect(script.indexOf('git/ref/heads/main')).toBeLessThan(script.indexOf('imagetools create'));
  });
});

describe('release tags (spec 017)', () => {
  const base = { refType: 'tag', sha: SHA, repository: 'owner/repo', version: '1.2.3' };

  it('AC-017-10: a tag that is not vX.Y.Z or not the package version is refused', () => {
    expect(() => plan({ ...base, refName: 'v1.2.4' })).toThrow(
      /v1\.2\.4.*1\.2\.3|1\.2\.3.*v1\.2\.4/s,
    );
    for (const refName of ['v1.2', '1.2.3', 'v1.2.3-rc.1', 'v01.2.3', 'release']) {
      expect(() => plan({ ...base, refName }), refName).toThrow(/vX\.Y\.Z/);
    }
    // The command the workflow runs reports the refusal as an error annotation.
    const dir = mkdtempSync(join(tmpdir(), 'kritzel-release-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    const run = (refName: string) =>
      spawnSync('node', [`${root}scripts/release.mjs`, 'plan'], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: join(dir, 'output'),
          GITHUB_REF_TYPE: 'tag',
          GITHUB_REF_NAME: refName,
          GITHUB_SHA: SHA,
          GITHUB_REPOSITORY: 'Owner/Repo',
        },
      });
    const refused = run('v2.0.0');
    expect(refused.status).toBe(1);
    expect(refused.stdout).toMatch(/^::error::.*v2\.0\.0.*1\.2\.3/m);

    writeFileSync(
      join(dir, 'CHANGELOG.md'),
      '# Changelog\n\n## [1.2.3] - 2026-12-01\n\n- First.\n',
    );
    const accepted = run('v1.2.3');
    expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0);
    expect(readFileSync(join(dir, 'output'), 'utf8').split('\n')).toEqual(
      expect.arrayContaining([
        'image=ghcr.io/owner/repo',
        'version=1.2.3',
        'build_version=1.2.3+3f2a9c1',
        'tags=1.2.3 1.2 latest',
        'release=true',
      ]),
    );
  });

  it('AC-017-11: a tag run needs its commit on main and its sha-<commit> image, and builds nothing', () => {
    const job = release.jobs.plan!;
    const tagOnly = job.steps!.filter((step) => step.if === "steps.plan.outputs.release == 'true'");
    const script = tagOnly.map((step) => step.run).join('\n');
    expect(script).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
    expect(script).toMatch(/::error::[^\n]*is not on main/);
    expect(script).toContain('docker buildx imagetools inspect "$IMAGE:sha-$GITHUB_SHA"');
    expect(script).toMatch(/::error::No image [^\n]*sha-\$GITHUB_SHA/);
    expect(job.outputs!.digest).toBe('${{ steps.image.outputs.digest }}');
    expect(
      job.steps!.find((step) => step.uses?.startsWith('actions/checkout@'))!.with,
    ).toMatchObject({
      'fetch-depth': 0,
    });
    // The only build is the one of main; a tag reaches the checks through the plan.
    expect(release.jobs.build!.if).toBe("github.ref_type == 'branch'");
    const gate = release.jobs.test!.if!;
    expect(gate).toContain("needs.plan.result == 'success'");
    expect(gate).toContain("needs.build.result == 'success'");
    expect(gate).toContain(
      "needs.build.result == 'skipped' && needs.plan.outputs.release == 'true'",
    );
  });

  it('AC-017-12: a version is looked up as text, never as a pattern', () => {
    // Every character with a meaning in a regular expression, the backslash included.
    const special = '.*+?^${}()|[]\\/-';
    expect(escapeRegExp('1.2.3')).toBe('1\\.2\\.3');
    expect(escapeRegExp('a\\b')).toBe('a\\\\b');
    expect(new RegExp(`^${escapeRegExp(special)}$`).test(special)).toBe(true);
    for (const character of special) {
      const pattern = new RegExp(`^${escapeRegExp(character)}$`);
      expect(pattern.test(character), character).toBe(true);
      expect(pattern.test('x'), character).toBe(false);
      expect(pattern.test(''), character).toBe(false);
    }
    // A dot in the version does not stand for any character, and a pattern is not run.
    const log = '# Changelog\n\n## 1x2x3\n\n- Not this one.\n\n## [1.2.3]\n\n- This one.\n';
    expect(changelogSection(log, '1.2.3')).toBe('- This one.');
    expect(() => changelogSection(log, '1.2.\\d')).toThrow(/no section for version 1\.2\.\\d/);
    expect(() => changelogSection(log, '.*')).toThrow(/no section/);
  });

  it('AC-017-12: the changelog section of the version is found, or its absence is named', () => {
    const log = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.3.0] - 2026-12-24',
      '',
      '### Added',
      '',
      '- Snow.',
      '',
      '## 1.2.3 (2026-12-01)',
      '',
      '- First release.',
      '',
      '## [1.2.2]',
      '',
      '[1.3.0]: https://example.invalid/compare/v1.2.3...v1.3.0',
    ].join('\n');
    expect(changelogSection(log, '1.3.0')).toBe('### Added\n\n- Snow.');
    expect(changelogSection(log, '1.2.3')).toBe('- First release.');
    for (const [content, version] of [
      [null, '1.2.3'],
      [log, '2.0.0'],
      [log, '1.2.2'],
      [log, '1.3'],
    ] as const) {
      let message = '';
      try {
        changelogSection(content, version);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, version).toContain('CHANGELOG.md');
      expect(message, version).toContain(version);
    }
  });
});

describe('GitHub Release (spec 017)', () => {
  const job = release.jobs.release!;

  it('AC-017-13: the notes carry the changelog, the digest and how to verify the signature', () => {
    const notes = releaseNotes({
      version: '1.2.3',
      image: 'ghcr.io/owner/repo',
      digest: DIGEST,
      repository: 'Owner/Repo',
      serverUrl: 'https://github.com',
      sha: SHA,
      changelog: '- First release.',
    });
    expect(notes.startsWith('- First release.\n')).toBe(true);
    expect(notes).toContain(`ghcr.io/owner/repo@${DIGEST}`);
    expect(notes).toContain('`ghcr.io/owner/repo:1.2.3`');
    const verify = /```bash\n(cosign verify [\s\S]*?)\n```/.exec(notes)![1]!;
    expect(verify).toContain(`cosign verify ghcr.io/owner/repo@${DIGEST}`);
    expect(verify).toContain(
      '--certificate-oidc-issuer https://token.actions.githubusercontent.com',
    );
    expect(verify).toContain(
      '--certificate-identity https://github.com/Owner/Repo/.github/workflows/release.yml@refs/tags/v1.2.3',
    );
    expect(() => releaseNotes({ version: '1.2.3', digest: 'latest' } as never)).toThrow(/digest/);
    expect(runs(job)).toMatch(/node scripts\/release\.mjs notes --digest "\$DIGEST" > /);
  });

  it('AC-017-14: created on a tag after promotion, with SBOMs, the chart and the promo files', () => {
    expect(needs(job)).toContain('promote');
    expect(job.if).toBe(
      "${{ !cancelled() && needs.promote.result == 'success' && needs.plan.outputs.release == 'true' }}",
    );
    const script = runs(job);
    expect(script).toContain('for platform in linux/amd64 linux/arm64');
    expect(script).toContain('(index .SBOM \\"$platform\\").SPDX');
    expect(script).toContain('kritzel-$VERSION-${platform//\\//-}.spdx.json');
    expect(script).toMatch(/helm package [^\n]*--app-version "\$VERSION"/);
    expect(script).toContain('if [ -d marketing/promo/dist ]');
    expect(script).toMatch(/gh release create "\$GITHUB_REF_NAME"[^\n]*--verify-tag/);
    expect(script).toContain('--title "Kritzel $VERSION"');
    // No other job, and no other workflow, creates a release.
    for (const file of workflowFiles) {
      for (const [name, other] of Object.entries(load(file).jobs)) {
        if (file === 'release.yml' && name === 'release') continue;
        expect(runs(other), `${file} ${name}`).not.toContain('gh release');
      }
    }
    // helm comes from the same checksum-verified download as in CI.
    const pin = (source: string) =>
      /HELM_VERSION: (\S+)\s+HELM_SHA256: ([0-9a-f]{64})/.exec(source);
    expect(pin(text('release.yml'))?.slice(1)).toEqual(pin(text('ci.yml'))!.slice(1));
    expect(script).toContain('sha256sum --check --strict');
  });

  it('AC-017-15: the packaged chart installs the released image', () => {
    const values = read('deploy/helm/kritzel/values.yaml');
    const pinned = pinChartImage(values, { tag: '1.2.3', digest: DIGEST });
    const imageOf = (source: string) => (parse(source) as { image: Record<string, string> }).image;
    expect(imageOf(pinned)).toEqual({ ...imageOf(values), tag: '1.2.3', digest: DIGEST });
    // Nothing else changes.
    expect(
      pinned.split('\n').filter((line, index) => line !== values.split('\n')[index]),
    ).toHaveLength(2);
    expect(() => pinChartImage('replicas: 1\n', { tag: '1.2.3', digest: DIGEST })).toThrow(/image/);
    expect(runs(job)).toMatch(/node scripts\/release\.mjs chart-values --digest "\$DIGEST" /);
  });
});

describe('permissions (spec 017)', () => {
  it('AC-017-16: every workflow defaults to read, and each release job has only what it needs', () => {
    for (const file of workflowFiles) {
      const workflow = load(file);
      // A reusable workflow declares nothing and gets what its caller grants.
      if ('workflow_call' in workflow.on) expect(workflow.permissions, file).toBeUndefined();
      else expect(workflow.permissions, file).toEqual({ contents: 'read' });
    }
    const granted = Object.fromEntries(
      Object.entries(release.jobs).map(([name, job]) => [name, job.permissions]),
    );
    expect(granted).toEqual({
      plan: { contents: 'read', packages: 'read' },
      build: { contents: 'read', packages: 'write' },
      test: { contents: 'read', packages: 'read' },
      scan: { contents: 'read', packages: 'read' },
      sign: { contents: 'read', packages: 'write', 'id-token': 'write', attestations: 'write' },
      promote: { contents: 'read', packages: 'write' },
      release: { contents: 'write', packages: 'read' },
    });
  });
});

describe('security checks (spec 017)', () => {
  const always = (job: Job) => expect(job.if).toBeUndefined();

  it('AC-017-17: production dependencies are audited on pull requests, on main and weekly', () => {
    expect(Object.keys(security.on).sort()).toEqual([
      'pull_request',
      'push',
      'schedule',
      'workflow_dispatch',
    ]);
    expect(security.on.push).toEqual({ branches: ['main'] });
    const [schedule] = security.on.schedule as { cron: string }[];
    // Minute, hour, any day, any month, one day of the week.
    expect(schedule!.cron).toMatch(/^\d+ \d+ \* \* [0-6]$/);
    always(security.jobs.audit!);
    expect(runs(security.jobs.audit!)).toContain('pnpm audit --prod --audit-level high');
    expect(text('security.yml')).not.toContain('continue-on-error');
  });

  it('AC-017-18: dependency review runs on pull requests and fails on high severity', () => {
    const job = security.jobs['dependency-review']!;
    expect(job.if).toBe("github.event_name == 'pull_request'");
    const step = job.steps!.find((candidate) =>
      candidate.uses?.startsWith('actions/dependency-review-action@'),
    )!;
    expect(step.with).toMatchObject({ 'fail-on-severity': 'high' });
  });

  it('AC-017-19: CodeQL analyses JavaScript and TypeScript on every trigger', () => {
    const job = security.jobs.codeql!;
    always(job);
    expect(job.permissions).toEqual({ contents: 'read', 'security-events': 'write' });
    const init = job.steps!.find((step) => step.uses?.startsWith('github/codeql-action/init@'))!;
    expect(init.with).toMatchObject({ languages: 'javascript-typescript' });
    expect(uses(job).some((action) => action.startsWith('github/codeql-action/analyze@'))).toBe(
      true,
    );
  });

  it('AC-017-20: gitleaks scans the full history from an image pinned by digest', () => {
    const job = security.jobs.secrets!;
    always(job);
    expect(
      job.steps!.find((step) => step.uses?.startsWith('actions/checkout@'))!.with,
    ).toMatchObject({
      'fetch-depth': 0,
    });
    expect(runs(job)).toContain('scripts/scan-secrets.sh');
    const scan = withFakeDocker('scripts/scan-secrets.sh', []);
    expect(scan.status, scan.output).toBe(0);
    expect(scan.args.join(' ')).toMatch(
      /ghcr\.io\/gitleaks\/gitleaks:v[\d.]+@sha256:[0-9a-f]{64} git /,
    );
    expect(scan.args).toContain('--redact');
    expect(scan.args.join(' ')).toContain('--exit-code 1');
    // The repository is mounted read-only, and a finding fails the script.
    expect(scan.args.some((arg) => /:\/repo:ro$/.test(arg))).toBe(true);
    expect(withFakeDocker('scripts/scan-secrets.sh', [], { FAKE_DOCKER_EXIT: '1' }).status).toBe(1);
  });

  it('AC-017-21: the latest image is rescanned weekly with the release script', () => {
    const job = security.jobs.image!;
    expect(job.if).toBe(
      "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    );
    expect(job.permissions).toEqual({ contents: 'read', packages: 'read' });
    const script = runs(job);
    expect(script).toContain(':latest');
    expect(script).toMatch(/scripts\/scan-image\.sh "\$IMAGE@\$digest"/);
    // Before the first release there is nothing to scan: say so, and pass.
    expect(script).toMatch(/not found[\s\S]*::notice::[\s\S]*exit 0/);
  });

  it('AC-017-22: Dependabot watches npm, GitHub Actions and Docker every week', () => {
    const config = parse(read('.github/dependabot.yml')) as {
      version: number;
      updates: { 'package-ecosystem': string; directory: string; schedule: { interval: string } }[];
    };
    expect(config.version).toBe(2);
    expect(config.updates.map((update) => update['package-ecosystem']).sort()).toEqual([
      'docker',
      'github-actions',
      'npm',
    ]);
    for (const update of config.updates) {
      expect(update.directory).toBe('/');
      expect(update.schedule.interval).toBe('weekly');
    }
  });

  it('AC-017-23: SECURITY.md says how to report privately and what is supported', () => {
    const policy = read('SECURITY.md');
    expect(policy).toContain('## Reporting a vulnerability');
    expect(policy).toContain('## Supported versions');
    expect(policy).toContain(
      'https://github.com/Mistral-valaise/open-skribbl/security/advisories/new',
    );
    expect(policy).toMatch(/not\b[^.]*\bpublic issue/i);
    expect(policy).toContain('latest release');
    // No personal address: reports go through the private advisory form.
    expect(policy).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });
});

describe('pinning (spec 017)', () => {
  it('AC-017-24: every third-party action is pinned to a commit, with its version as a comment', () => {
    let pinned = 0;
    for (const file of workflowFiles) {
      for (const line of text(file).split('\n')) {
        const reference = /^\s*(?:-\s+)?uses:\s*(.*)$/.exec(line)?.[1];
        if (reference === undefined) continue;
        // A workflow of this repository is referenced by path and versioned with it.
        if (reference.startsWith('./')) continue;
        expect(reference, `${file}: ${line.trim()}`).toMatch(
          /^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
        );
        pinned += 1;
      }
    }
    expect(pinned).toBeGreaterThan(20);
    // The same action is the same commit everywhere outside the deployment workflow,
    // which is raised on its own (spec 016).
    const commits = new Map<string, Set<string>>();
    for (const file of workflowFiles.filter((name) => name !== 'deploy-openshift-demo.yml')) {
      for (const [, action, commit] of text(file).matchAll(
        /uses:\s*([\w.-]+\/[\w.-]+)[\w./-]*@([0-9a-f]{40})/g,
      )) {
        commits.set(action!, (commits.get(action!) ?? new Set()).add(commit!));
      }
    }
    for (const [action, found] of commits) expect([...found], action).toHaveLength(1);
  });

  it('AC-017-25: tool images are referenced by version and digest', () => {
    const sources = [
      ...workflowFiles.map((file) => text(file)),
      read('scripts/scan-image.sh'),
      read('scripts/scan-secrets.sh'),
    ].join('\n');
    const tools = [
      'rhysd/actionlint',
      'ghcr.io/aquasecurity/trivy',
      'ghcr.io/gitleaks/gitleaks',
      'caddy',
    ];
    for (const tool of tools) {
      const references = [
        ...sources.matchAll(new RegExp(`(?<![\\w/.-])${escapeRegExp(tool)}:[^\\s'"]+`, 'g')),
      ];
      expect(references.length, tool).toBeGreaterThan(0);
      for (const [reference] of references) {
        expect(reference, reference).toMatch(/:v?\d+\.\d+\.\d+(-[a-z]+)?@sha256:[0-9a-f]{64}$/);
      }
    }
    // No image is run by a moving tag.
    expect(sources).not.toMatch(/docker run[^\n]*:latest\b/);
  });
});

describe('hosting guide (spec 017)', () => {
  it('AC-017-27: the guide explains the tags, verifying a signature and rolling back', () => {
    const guide = read('docs/HOSTING.md');
    const start = guide.indexOf('\n## Published images\n');
    expect(start).toBeGreaterThan(-1);
    const section = guide.slice(start, guide.indexOf('\n## ', start + 1));
    for (const tag of ['`latest`', '`edge`', '`sha-<commit>`', '`X.Y.Z`', '`X.Y`']) {
      expect(section, tag).toContain(`| ${tag}`);
    }
    expect(section).toContain('### Verifying the signature');
    expect(section).toContain('cosign verify ghcr.io/mistral-valaise/open-skribbl@sha256:');
    expect(section).toContain(
      '--certificate-oidc-issuer https://token.actions.githubusercontent.com',
    );
    expect(section).toMatch(/--certificate-identity-regexp '[^']*release\\\.yml@refs/);
    expect(section).toContain('### Rolling back');
    expect(section).toMatch(
      /docker run [^\n]*ghcr\.io\/mistral-valaise\/open-skribbl:\d+\.\d+\.\d+/,
    );
    // The untested tag is called what it is.
    expect(section).toMatch(/`sha-<commit>`[^\n]*before/);
  });
});
