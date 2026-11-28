#!/usr/bin/env node
// Release preparation tooling (spec 017, AC-017-34): bumps package.json and
// Helm Chart.yaml versions, drafts CHANGELOG.md entries from git history, and
// verifies that package.json and Chart.yaml appVersion stay in sync.
//
// Usage, from the repository root:
//   node scripts/release-prepare.mjs --check
//       Verify package.json version matches Chart.yaml appVersion fields.
//   node scripts/release-prepare.mjs [--bump patch|minor|major] [--version X.Y.Z] [--dry-run]
//       Bump versions, draft CHANGELOG.md, and print `version=X.Y.Z`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { escapeRegExp } from './release.mjs';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUMP_KINDS = new Set(['patch', 'minor', 'major']);
const DEFAULT_REPOSITORY = 'Mistral-valaise/open-skribbl';

const DEFAULT_CHART_PATHS = [
  { path: 'deploy/helm/kritzel/Chart.yaml', required: true },
  { path: 'deploy/helm/kritzel-observability/Chart.yaml', required: false },
];

const CHANGELOG_HEADINGS = ['Added', 'Fixed', 'Changed', 'Security', 'Operations'];

const OPERATIONS_SCOPES = new Set([
  'ci',
  'ops',
  'deploy',
  'helm',
  'infra',
  'docker',
  'k8s',
  'chart',
  'observability',
  'cd',
  'release',
]);

const NOISE_PATTERNS = [
  /^Merge (?:pull request #\d+|branch\b|remote-tracking branch\b|tag\b)/i,
  /^(?:fixup|squash|amend)!\s/i,
  /^WIP(?::|\s|$)/i,
  /^chore\(release\):\s*prepare\b/i,
];

function parseSemver(value, label = 'version') {
  if (typeof value !== 'string' || !SEMVER.test(value)) {
    throw new Error(`Invalid ${label} '${value}'. Expected X.Y.Z.`);
  }
  const [, major, minor, patch] = SEMVER.exec(value);
  return [Number(major), Number(minor), Number(patch)];
}

/**
 * Compute the next `X.Y.Z` version from `current` using either a bump kind
 * (`'patch' | 'minor' | 'major'`) or an explicit higher `X.Y.Z` SemVer string.
 */
export function bumpSemver(current, target) {
  const [major, minor, patch] = parseSemver(current, 'current version');

  if (BUMP_KINDS.has(target)) {
    if (target === 'major') return `${major + 1}.0.0`;
    if (target === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }

  let next;
  try {
    next = parseSemver(target, 'target version');
  } catch {
    throw new Error(`Invalid target '${target}'. Expected 'patch', 'minor', 'major', or X.Y.Z.`);
  }
  const [nextMajor, nextMinor, nextPatch] = next;
  const isHigher =
    nextMajor > major ||
    (nextMajor === major && (nextMinor > minor || (nextMinor === minor && nextPatch > patch)));
  if (!isHigher) {
    throw new Error(`Target version ${target} must be greater than current version ${current}.`);
  }
  return target;
}

/**
 * Update `appVersion` (and optionally `version`) in a Helm `Chart.yaml` string
 * while preserving comments, blank lines, and surrounding formatting.
 */
export function updateChartYaml(yamlText, { version, appVersion } = {}) {
  if (typeof yamlText !== 'string') {
    throw new Error('Chart.yaml content must be a string.');
  }
  if (version !== undefined) parseSemver(version, 'chart version');
  if (appVersion !== undefined) parseSemver(appVersion, 'appVersion');

  const eol = yamlText.includes('\r\n') ? '\r\n' : '\n';
  const lines = yamlText.split(/\r?\n/);

  if (version !== undefined) {
    const pattern = /^version:\s*(?:'[^']*'|"[^"]*"|\S+)(\s*#.*)?$/;
    const index = lines.findIndex((line) => pattern.test(line));
    if (index === -1) throw new Error('Chart.yaml has no top-level version field.');
    const comment = pattern.exec(lines[index])[1] ?? '';
    lines[index] = `version: ${version}${comment}`;
  }

  if (appVersion !== undefined) {
    const pattern = /^appVersion:\s*(?:'[^']*'|"[^"]*"|\S+)(\s*#.*)?$/;
    const index = lines.findIndex((line) => pattern.test(line));
    if (index === -1) throw new Error('Chart.yaml has no top-level appVersion field.');
    const comment = pattern.exec(lines[index])[1] ?? '';
    lines[index] = `appVersion: '${appVersion}'${comment}`;
  }

  return lines.join(eol);
}

function classifyCommit(subject) {
  const conventional = /^([a-z][a-z0-9_-]*)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i.exec(subject);
  if (!conventional) {
    return { category: 'Changed', scope: undefined, breaking: false, description: subject };
  }

  const type = conventional[1].toLowerCase();
  const scope = conventional[2]?.trim();
  const scopeLower = scope?.toLowerCase() ?? '';
  const breaking = Boolean(conventional[3]);
  const description = conventional[4].trim();

  let category = 'Changed';
  if (type === 'feat' || type === 'feature' || type === 'add') {
    category = 'Added';
  } else if (
    type === 'security' ||
    type === 'sec' ||
    scopeLower === 'security' ||
    scopeLower === 'sec'
  ) {
    category = 'Security';
  } else if (type === 'fix' || type === 'bugfix' || type === 'hotfix') {
    category = 'Fixed';
  } else if (
    type === 'ci' ||
    type === 'ops' ||
    type === 'deploy' ||
    type === 'helm' ||
    type === 'infra' ||
    type === 'observability' ||
    OPERATIONS_SCOPES.has(scopeLower)
  ) {
    category = 'Operations';
  }

  return { category, scope, breaking, description };
}

function formatEntry({ scope, breaking, description }, repository) {
  const withLinks = repository
    ? description.replace(/\(#(\d+)\)/g, `([#$1](https://github.com/${repository}/pull/$1))`)
    : description;
  const prefix = breaking ? '**Breaking:** ' : '';
  return scope ? `- **${scope}**: ${prefix}${withLinks}` : `- ${prefix}${withLinks}`;
}

/**
 * Draft a Keep a Changelog section (`## [X.Y.Z] - YYYY-MM-DD`) from git commit
 * subject lines, grouped under Added, Fixed, Changed, Security, and Operations.
 */
export function draftChangelogSection(
  commits,
  version,
  date = new Date().toISOString().slice(0, 10),
  repository = '',
) {
  parseSemver(version, 'version');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid release date '${date}'. Expected YYYY-MM-DD.`);
  }

  const rawCommits = Array.isArray(commits)
    ? commits
    : typeof commits === 'string'
      ? commits.split(/\r?\n/)
      : [];

  const buckets = new Map(CHANGELOG_HEADINGS.map((heading) => [heading, []]));
  const seen = new Set();

  for (const raw of rawCommits) {
    const subject = String(raw).trim();
    if (!subject) continue;
    if (NOISE_PATTERNS.some((pattern) => pattern.test(subject))) continue;

    const parsed = classifyCommit(subject);
    const bullet = formatEntry(parsed, repository);
    if (seen.has(bullet)) continue;
    seen.add(bullet);
    buckets.get(parsed.category).push(bullet);
  }

  const parts = [`## [${version}] - ${date}`];
  let hasEntries = false;
  for (const heading of CHANGELOG_HEADINGS) {
    const entries = buckets.get(heading);
    if (entries.length === 0) continue;
    hasEntries = true;
    parts.push('', `### ${heading}`, '', ...entries);
  }

  if (!hasEntries) {
    parts.push('', '### Changed', '', '- Maintenance and release preparation.');
  }

  return parts.join('\n');
}

/**
 * Insert a drafted release section into `CHANGELOG.md` after the intro
 * paragraph (or `## [Unreleased]`) and before the previous release section,
 * and add or update the version compare reference link at the bottom.
 */
export function insertChangelogSection(
  changelogText,
  section,
  version,
  repository,
  previousVersion,
) {
  parseSemver(version, 'version');
  if (typeof changelogText !== 'string') {
    throw new Error('CHANGELOG.md content must be a string.');
  }
  const eol = changelogText.includes('\r\n') ? '\r\n' : '\n';
  const lines = changelogText.split(/\r?\n/);

  const existingHeading = new RegExp(`^## \\[?v?${escapeRegExp(version)}\\]?(\\s.*)?$`);
  if (lines.some((line) => existingHeading.test(line))) {
    throw new Error(`CHANGELOG.md already contains a section for version ${version}.`);
  }

  const unreleasedIndex = lines.findIndex((line) => /^## \[?Unreleased\]?(\s.*)?$/i.test(line));
  const firstReleaseIndex = lines.findIndex(
    (line, index) => index > unreleasedIndex && /^## /.test(line),
  );
  const linkBlockIndex = lines.findIndex((line) => /^\[[^\]]+\]:\s+\S+$/.test(line));

  let insertAt;
  if (firstReleaseIndex !== -1) {
    insertAt = firstReleaseIndex;
  } else if (linkBlockIndex !== -1) {
    insertAt = linkBlockIndex;
  } else {
    insertAt = lines.length;
  }

  const before = lines.slice(0, insertAt);
  while (before.length > 0 && before.at(-1).trim() === '') before.pop();

  const after = lines.slice(insertAt);
  while (after.length > 0 && after[0].trim() === '') after.shift();

  const sectionLines = section.trim().split(/\r?\n/);
  const merged = [...before, '', ...sectionLines];
  if (after.length > 0) merged.push('', ...after);

  if (repository) {
    const compareUrl = previousVersion
      ? `https://github.com/${repository}/compare/v${previousVersion}...v${version}`
      : `https://github.com/${repository}/releases/tag/v${version}`;
    const versionLink = `[${version}]: ${compareUrl}`;
    const versionLinkPattern = new RegExp(`^\\[${escapeRegExp(version)}\\]:\\s+\\S+$`);
    const existingLinkIndex = merged.findIndex((line) => versionLinkPattern.test(line));
    const unreleasedLinkIndex = merged.findIndex((line) => /^\[unreleased\]:\s+\S+$/i.test(line));

    if (unreleasedLinkIndex !== -1) {
      merged[unreleasedLinkIndex] =
        `[unreleased]: https://github.com/${repository}/compare/v${version}...HEAD`;
    }

    if (existingLinkIndex !== -1) {
      merged[existingLinkIndex] = versionLink;
    } else if (unreleasedLinkIndex !== -1) {
      merged.splice(unreleasedLinkIndex + 1, 0, versionLink);
    } else {
      const firstLinkIndex = merged.findIndex((line) => /^\[[^\]]+\]:\s+\S+$/.test(line));
      if (firstLinkIndex !== -1) {
        merged.splice(firstLinkIndex, 0, versionLink);
      } else {
        while (merged.length > 0 && merged.at(-1).trim() === '') merged.pop();
        merged.push('', versionLink);
      }
    }
  }

  while (merged.length > 0 && merged.at(-1).trim() === '') merged.pop();
  return `${merged.join(eol)}${eol}`;
}

function extractYamlScalar(yamlText, key) {
  const match = new RegExp(
    `^${escapeRegExp(key)}:\\s*(?:'([^']*)'|"([^"]*)"|([^\\s#]+))`,
    'm',
  ).exec(yamlText);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

/**
 * Verify that `package.json` `version` matches `appVersion` in the Helm
 * `Chart.yaml` files under `rootDir`.
 */
export function checkVersionSync(rootDir = process.cwd(), chartPaths = DEFAULT_CHART_PATHS) {
  const pkgPath = join(rootDir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing package.json at ${pkgPath}.`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;
  parseSemver(version, 'package.json version');

  const charts = [];
  const mismatches = [];

  for (const entry of chartPaths) {
    const chartPath = typeof entry === 'string' ? entry : entry.path;
    const required = typeof entry === 'string' ? true : entry.required !== false;
    const fullPath = join(rootDir, chartPath);

    if (!existsSync(fullPath)) {
      if (required) {
        mismatches.push({
          file: chartPath,
          expected: version,
          actual: undefined,
          reason: 'Chart.yaml does not exist',
        });
      }
      continue;
    }

    const yamlText = readFileSync(fullPath, 'utf8');
    const chartVersion = extractYamlScalar(yamlText, 'version');
    const appVersion = extractYamlScalar(yamlText, 'appVersion');
    charts.push({ file: chartPath, version: chartVersion, appVersion });

    if (appVersion !== version) {
      mismatches.push({
        file: chartPath,
        expected: version,
        actual: appVersion,
        reason: `appVersion is '${appVersion ?? ''}', expected '${version}'`,
      });
    }
  }

  return { ok: mismatches.length === 0, version, charts, mismatches };
}

function runGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function getCommitsSinceLatestTag(rootDir) {
  const latestTag = runGit(['describe', '--tags', '--abbrev=0', '--match', 'v*'], rootDir);
  if (latestTag.status === 0) {
    const tag = latestTag.stdout.trim();
    const log = runGit(['log', `${tag}..HEAD`, '--format=%s'], rootDir);
    if (log.status !== 0) {
      throw new Error(`Failed to read git log since ${tag}: ${log.stderr.trim()}`);
    }
    return {
      previousVersion: tag.replace(/^v/, ''),
      commits: log.stdout.split(/\r?\n/).filter(Boolean),
    };
  }

  const log = runGit(['log', '--format=%s'], rootDir);
  return {
    previousVersion: undefined,
    commits: log.status === 0 ? log.stdout.split(/\r?\n/).filter(Boolean) : [],
  };
}

function resolveRepository(rootDir) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = runGit(['remote', 'get-url', 'origin'], rootDir);
  if (remote.status === 0) {
    const match = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remote.stdout.trim());
    if (match) return match[1];
  }
  return DEFAULT_REPOSITORY;
}

function parseCliArgs(args) {
  const options = {
    check: false,
    dryRun: false,
    bump: 'patch',
    version: undefined,
    date: undefined,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--bump') {
      const value = args[++i];
      if (!value || !BUMP_KINDS.has(value)) {
        throw new Error(`Invalid --bump value '${value}'. Expected patch, minor, or major.`);
      }
      options.bump = value;
    } else if (arg === '--version') {
      const value = args[++i];
      if (!value) throw new Error('Missing --version <X.Y.Z>.');
      options.version = value;
    } else if (arg === '--date') {
      const value = args[++i];
      if (!value) throw new Error('Missing --date <YYYY-MM-DD>.');
      options.date = value;
    } else {
      throw new Error(
        `Unknown option '${arg}'. Usage: node scripts/release-prepare.mjs [--check] [--bump patch|minor|major] [--version X.Y.Z] [--dry-run]`,
      );
    }
  }

  return options;
}

function main(args, rootDir = process.cwd()) {
  const options = parseCliArgs(args);

  if (options.check) {
    const result = checkVersionSync(rootDir);
    if (!result.ok) {
      const details = result.mismatches.map((m) => `${m.file}: ${m.reason}`).join('; ');
      throw new Error(`Version sync check failed (package.json=${result.version}): ${details}`);
    }
    console.log(`Versions are in sync (${result.version}).`);
    return;
  }

  const pkgPath = join(rootDir, 'package.json');
  const pkgText = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgText);
  const currentVersion = pkg.version;

  const target = options.version ?? options.bump;
  const nextVersion = bumpSemver(currentVersion, target);

  const [curMaj, curMin] = parseSemver(currentVersion, 'package.json version');
  const [nextMaj, nextMin] = parseSemver(nextVersion, 'next version');
  const chartBumpKind = nextMaj > curMaj || nextMin > curMin ? 'minor' : 'patch';

  const kritzelChartPath = join(rootDir, 'deploy/helm/kritzel/Chart.yaml');
  const kritzelChartText = readFileSync(kritzelChartPath, 'utf8');
  const currentChartVersion = extractYamlScalar(kritzelChartText, 'version');
  const nextChartVersion = bumpSemver(currentChartVersion, chartBumpKind);
  const updatedKritzelChart = updateChartYaml(kritzelChartText, {
    version: nextChartVersion,
    appVersion: nextVersion,
  });

  const obsChartPath = join(rootDir, 'deploy/helm/kritzel-observability/Chart.yaml');
  const updatedObsChart = existsSync(obsChartPath)
    ? updateChartYaml(readFileSync(obsChartPath, 'utf8'), { appVersion: nextVersion })
    : undefined;

  const { previousVersion, commits } = getCommitsSinceLatestTag(rootDir);
  const repository = resolveRepository(rootDir);
  const section = draftChangelogSection(commits, nextVersion, options.date, repository);
  const changelogPath = join(rootDir, 'CHANGELOG.md');
  const currentChangelog = existsSync(changelogPath)
    ? readFileSync(changelogPath, 'utf8')
    : '# Changelog\n';
  const updatedChangelog = insertChangelogSection(
    currentChangelog,
    section,
    nextVersion,
    repository,
    previousVersion ?? currentVersion,
  );

  const updatedPkgText = `${JSON.stringify({ ...pkg, version: nextVersion }, null, 2)}\n`;

  if (!options.dryRun) {
    writeFileSync(pkgPath, updatedPkgText);
    writeFileSync(kritzelChartPath, updatedKritzelChart);
    if (updatedObsChart !== undefined) writeFileSync(obsChartPath, updatedObsChart);
    writeFileSync(changelogPath, updatedChangelog);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`);
    }
  }

  console.log(`version=${nextVersion}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
}
