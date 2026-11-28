import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  bumpSemver,
  checkVersionSync,
  draftChangelogSection,
  insertChangelogSection,
  updateChartYaml,
} from './release-prepare.mjs';
import { changelogSection } from './release.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = `${root}scripts/release-prepare.mjs`;

describe('release preparation helpers (spec 017)', () => {
  it('AC-017-34: bumpSemver supports patch, minor, major and explicit higher versions', () => {
    expect(bumpSemver('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpSemver('1.2.9', 'patch')).toBe('1.2.10');
    expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0');
    expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0');
    expect(bumpSemver('1.0.0', '1.0.5')).toBe('1.0.5');
    expect(bumpSemver('1.0.0', '1.4.0')).toBe('1.4.0');
    expect(bumpSemver('1.0.0', '2.0.0')).toBe('2.0.0');
  });

  it('AC-017-34: bumpSemver rejects invalid formats and non-increasing explicit targets', () => {
    expect(() => bumpSemver('1.2.3', '1.2.3')).toThrow(/greater than/);
    expect(() => bumpSemver('1.2.3', '1.2.2')).toThrow(/greater than/);
    expect(() => bumpSemver('2.0.0', '1.9.9')).toThrow(/greater than/);
    expect(() => bumpSemver('v1.0.0', 'patch')).toThrow(/Invalid current version/);
    expect(() => bumpSemver('1.0.0', 'v1.0.1')).toThrow(/Invalid target/);
    expect(() => bumpSemver('1.0.0', '1.0.1-rc.1')).toThrow(/Invalid target/);
    expect(() => bumpSemver('1.0.0', '01.0.1')).toThrow(/Invalid target/);
    expect(() => bumpSemver('1.0.0', 'prerelease')).toThrow(/Invalid target/);
  });

  it('AC-017-34: updateChartYaml updates appVersion and optional version while preserving comments', () => {
    const chartYaml = [
      'apiVersion: v2',
      'name: kritzel',
      '# Version of the chart. Raise it when the chart changes.',
      'version: 1.0.0',
      '# Version of the game this chart was written for.',
      "appVersion: '1.0.0'",
      'keywords:',
      '  - game',
      '',
    ].join('\n');

    const onlyApp = updateChartYaml(chartYaml, { appVersion: '1.0.1' });
    expect(onlyApp).toContain('version: 1.0.0');
    expect(onlyApp).toContain("appVersion: '1.0.1'");
    expect(onlyApp).toContain('# Version of the chart. Raise it when the chart changes.');
    expect(onlyApp).toContain('# Version of the game this chart was written for.');

    const both = updateChartYaml(chartYaml, { version: '1.1.0', appVersion: '1.2.0' });
    expect(both).toContain('version: 1.1.0');
    expect(both).toContain("appVersion: '1.2.0'");
    expect((parse(both) as { version: string; appVersion: string }).appVersion).toBe('1.2.0');

    expect(() => updateChartYaml('name: broken\n', { appVersion: '1.0.1' })).toThrow(/appVersion/);
    expect(() => updateChartYaml(chartYaml, { version: 'bad' })).toThrow(/Invalid chart version/);
  });

  it('AC-017-34: draftChangelogSection groups commits by Keep a Changelog heading and drops noise', () => {
    const commits = [
      'Merge pull request #16 from Mistral-valaise/feat/cool',
      "Merge branch 'main' into feat/other",
      'WIP: scratch note',
      'fixup! earlier typo',
      'chore(release): prepare v1.0.0',
      'feat(web): add keyboard shortcut overlay (#21)',
      'fix(server): close stale room timers',
      'security(auth): reject malformed session tokens',
      'ci: pin workflow action SHAs',
      'docs: clarify Helm upgrade steps',
      'feat(web): add keyboard shortcut overlay (#21)',
    ];

    const section = draftChangelogSection(
      commits,
      '1.1.0',
      '2026-11-28',
      'Mistral-valaise/open-skribbl',
    );

    expect(section).toMatch(/^## \[1\.1\.0\] - 2026-11-28\n/);
    expect(section).toContain('### Added\n\n- **web**: add keyboard shortcut overlay ([#21]');
    expect(section).toContain('### Fixed\n\n- **server**: close stale room timers');
    expect(section).toContain('### Changed\n\n- clarify Helm upgrade steps');
    expect(section).toContain('### Security\n\n- **auth**: reject malformed session tokens');
    expect(section).toContain('### Operations\n\n- pin workflow action SHAs');
    expect(section).not.toContain('Merge pull request');
    expect(section).not.toContain('Merge branch');
    expect(section).not.toContain('WIP:');
    expect(section).not.toContain('fixup!');
    expect(section).not.toContain('prepare v1.0.0');
    expect(section.match(/add keyboard shortcut overlay/g)).toHaveLength(1);
  });

  it('AC-017-34: draftChangelogSection still produces a non-empty section when all commits are noise', () => {
    const section = draftChangelogSection(['Merge branch "main"'], '1.0.1', '2026-11-28');
    expect(section).toContain('## [1.0.1] - 2026-11-28');
    expect(section).toContain('### Changed');
    const parsed = changelogSection(`# Changelog\n\n${section}\n`, '1.0.1');
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('AC-017-34: insertChangelogSection inserts after intro or Unreleased, adds compare link, and rejects duplicates', () => {
    const baseChangelog = [
      '# Changelog',
      '',
      'Notable changes to Kritzel, newest first.',
      '',
      '## [1.0.0] - 2026-11-27',
      '',
      '### The game',
      '',
      '- Initial release.',
      '',
      '[1.0.0]: https://github.com/Mistral-valaise/open-skribbl/releases/tag/v1.0.0',
      '',
    ].join('\n');

    const section = draftChangelogSection(
      ['feat(web): add palette presets'],
      '1.0.1',
      '2026-11-28',
      'Mistral-valaise/open-skribbl',
    );
    const updated = insertChangelogSection(
      baseChangelog,
      section,
      '1.0.1',
      'Mistral-valaise/open-skribbl',
      '1.0.0',
    );

    expect(updated.indexOf('## [1.0.1] - 2026-11-28')).toBeGreaterThan(
      updated.indexOf('Notable changes to Kritzel, newest first.'),
    );
    expect(updated.indexOf('## [1.0.1] - 2026-11-28')).toBeLessThan(
      updated.indexOf('## [1.0.0] - 2026-11-27'),
    );
    expect(updated).toContain(
      '[1.0.1]: https://github.com/Mistral-valaise/open-skribbl/compare/v1.0.0...v1.0.1',
    );
    expect(changelogSection(updated, '1.0.1')).toContain('add palette presets');
    expect(changelogSection(updated, '1.0.0')).toContain('Initial release.');

    const withUnreleased = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.0.0] - 2026-11-27',
      '',
      '- Initial release.',
      '',
      '[unreleased]: https://github.com/Mistral-valaise/open-skribbl/compare/v1.0.0...HEAD',
      '[1.0.0]: https://github.com/Mistral-valaise/open-skribbl/releases/tag/v1.0.0',
      '',
    ].join('\n');

    const updatedUnreleased = insertChangelogSection(
      withUnreleased,
      section,
      '1.0.1',
      'Mistral-valaise/open-skribbl',
      '1.0.0',
    );
    expect(updatedUnreleased.indexOf('## [Unreleased]')).toBeLessThan(
      updatedUnreleased.indexOf('## [1.0.1] - 2026-11-28'),
    );
    expect(updatedUnreleased.indexOf('## [1.0.1] - 2026-11-28')).toBeLessThan(
      updatedUnreleased.indexOf('## [1.0.0] - 2026-11-27'),
    );
    expect(updatedUnreleased).toContain(
      '[unreleased]: https://github.com/Mistral-valaise/open-skribbl/compare/v1.0.1...HEAD',
    );

    expect(() =>
      insertChangelogSection(updated, section, '1.0.1', 'Mistral-valaise/open-skribbl', '1.0.0'),
    ).toThrow(/already contains a section for version 1\.0\.1/);
  });

  it('AC-017-34: checkVersionSync validates package.json against Chart.yaml appVersion fields', () => {
    const repoResult = checkVersionSync(root);
    expect(repoResult.ok).toBe(true);
    expect(repoResult.mismatches).toEqual([]);

    const dir = mkdtempSync(join(tmpdir(), 'kritzel-sync-'));
    mkdirSync(join(dir, 'deploy/helm/kritzel'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.0' }));
    writeFileSync(
      join(dir, 'deploy/helm/kritzel/Chart.yaml'),
      "name: kritzel\nversion: 1.0.0\nappVersion: '1.2.0'\n",
    );
    // Optional kritzel-observability chart absent -> still passes cleanly.
    expect(checkVersionSync(dir).ok).toBe(true);

    // Add kritzel-observability with matching appVersion -> passes.
    mkdirSync(join(dir, 'deploy/helm/kritzel-observability'), { recursive: true });
    writeFileSync(
      join(dir, 'deploy/helm/kritzel-observability/Chart.yaml'),
      "name: kritzel-observability\nversion: 0.1.0\nappVersion: '1.2.0'\n",
    );
    const synced = checkVersionSync(dir);
    expect(synced.ok).toBe(true);
    expect(synced.charts).toHaveLength(2);

    // Drift kritzel-observability appVersion -> fails with mismatch details.
    writeFileSync(
      join(dir, 'deploy/helm/kritzel-observability/Chart.yaml'),
      "name: kritzel-observability\nversion: 0.1.0\nappVersion: '1.1.0'\n",
    );
    const drifted = checkVersionSync(dir);
    expect(drifted.ok).toBe(false);
    expect(drifted.mismatches).toHaveLength(1);
    expect(drifted.mismatches[0]).toMatchObject({
      file: 'deploy/helm/kritzel-observability/Chart.yaml',
      expected: '1.2.0',
      actual: '1.1.0',
    });
  });

  it('AC-017-34: CLI --check exits 0 when synced and exits 1 with error message when drifted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kritzel-cli-check-'));
    mkdirSync(join(dir, 'deploy/helm/kritzel'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    writeFileSync(
      join(dir, 'deploy/helm/kritzel/Chart.yaml'),
      "name: kritzel\nversion: 1.0.0\nappVersion: '1.2.3'\n",
    );

    const ok = spawnSync('node', [SCRIPT, '--check'], { cwd: dir, encoding: 'utf8' });
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain('1.2.3');

    writeFileSync(
      join(dir, 'deploy/helm/kritzel/Chart.yaml'),
      "name: kritzel\nversion: 1.0.0\nappVersion: '1.0.0'\n",
    );
    const fail = spawnSync('node', [SCRIPT, '--check'], { cwd: dir, encoding: 'utf8' });
    expect(fail.status).toBe(1);
    expect(fail.stdout + fail.stderr).toMatch(/::error::.*1\.2\.3.*1\.0\.0/);
  });

  it('AC-017-34: CLI prepares release files, respects --dry-run, and writes GITHUB_OUTPUT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kritzel-cli-prepare-'));
    mkdirSync(join(dir, 'deploy/helm/kritzel'), { recursive: true });
    mkdirSync(join(dir, 'deploy/helm/kritzel-observability'), { recursive: true });

    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify({ name: 'kritzel', version: '1.0.0' }, null, 2)}\n`,
    );
    writeFileSync(
      join(dir, 'deploy/helm/kritzel/Chart.yaml'),
      "apiVersion: v2\nname: kritzel\nversion: 1.0.0\nappVersion: '1.0.0'\n",
    );
    writeFileSync(
      join(dir, 'deploy/helm/kritzel-observability/Chart.yaml'),
      "apiVersion: v2\nname: kritzel-observability\nversion: 0.1.0\nappVersion: '1.0.0'\n",
    );
    writeFileSync(
      join(dir, 'CHANGELOG.md'),
      '# Changelog\n\n## [1.0.0] - 2026-11-27\n\n- Initial.\n\n[1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0\n',
    );

    const git = (args: string[]) =>
      spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.invalid',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.invalid',
        },
      });
    expect(git(['init']).status).toBe(0);
    expect(git(['add', '.']).status).toBe(0);
    expect(git(['commit', '-m', 'chore: initial release']).status).toBe(0);
    expect(git(['tag', 'v1.0.0']).status).toBe(0);
    writeFileSync(join(dir, 'feature.txt'), 'hello\n');
    expect(git(['add', '.']).status).toBe(0);
    expect(git(['commit', '-m', 'feat(web): add release helper']).status).toBe(0);

    const githubOutput = join(dir, 'github-output');
    const dryRun = spawnSync(
      'node',
      [SCRIPT, '--bump', 'minor', '--dry-run', '--date', '2026-11-28'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_OUTPUT: githubOutput },
      },
    );
    expect(dryRun.status, dryRun.stdout + dryRun.stderr).toBe(0);
    expect(dryRun.stdout.trim()).toBe('version=1.1.0');
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('1.0.0');

    const realRun = spawnSync('node', [SCRIPT, '--bump', 'minor', '--date', '2026-11-28'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_OUTPUT: githubOutput },
    });
    expect(realRun.status, realRun.stdout + realRun.stderr).toBe(0);
    expect(realRun.stdout.trim()).toBe('version=1.1.0');
    expect(readFileSync(githubOutput, 'utf8')).toContain('version=1.1.0');
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('1.1.0');
    expect(readFileSync(join(dir, 'deploy/helm/kritzel/Chart.yaml'), 'utf8')).toContain(
      'version: 1.1.0',
    );
    expect(
      readFileSync(join(dir, 'deploy/helm/kritzel-observability/Chart.yaml'), 'utf8'),
    ).toContain("appVersion: '1.1.0'");
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toContain('add release helper');
    expect(checkVersionSync(dir).ok).toBe(true);
  });

  it('AC-017-34: prepare-release workflow dispatches release preparation with pinned actions', () => {
    const workflowText = readFileSync(`${root}.github/workflows/prepare-release.yml`, 'utf8');
    const workflow = parse(workflowText) as {
      name: string;
      on: { workflow_dispatch: { inputs: Record<string, { default?: string; type: string }> } };
      permissions: Record<string, string>;
      concurrency?: { group: string; 'cancel-in-progress': boolean };
      jobs: {
        prepare: {
          'timeout-minutes': number;
          permissions: Record<string, string>;
          steps: { uses?: string; with?: Record<string, string>; run?: string }[];
        };
      };
    };
    expect(workflow.name).toBe('Prepare Release');
    expect(workflow.on.workflow_dispatch.inputs.bump?.default).toBe('patch');
    expect(workflow.on.workflow_dispatch.inputs.version?.type).toBe('string');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 'prepare-release',
      'cancel-in-progress': false,
    });
    expect(workflow.jobs.prepare['timeout-minutes']).toBe(15);
    expect(workflow.jobs.prepare.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });

    const cacheStep = workflow.jobs.prepare.steps.find((step) =>
      step.uses?.startsWith('actions/cache@'),
    );
    expect(cacheStep).toBeDefined();
    expect(cacheStep!.with?.path).toBe('deploy/helm/kritzel-observability/charts');
    expect(cacheStep!.with?.key).toContain('Chart.lock');

    expect(workflowText).toContain('--add-label release');
    expect(workflowText).toContain('GITHUB_STEP_SUMMARY');
    expect(workflowText).toContain('not permitted to create or approve pull requests');
    expect(workflowText).toContain('compare/main...');

    const settingsScript = readFileSync(`${root}scripts/gh-repo-settings.sh`, 'utf8');
    expect(settingsScript).toContain('actions/permissions/workflow');
    expect(settingsScript).toContain('default_workflow_permissions=read');
    expect(settingsScript).toContain('can_approve_pull_request_reviews=true');
  });
});
