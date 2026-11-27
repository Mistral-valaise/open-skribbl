#!/usr/bin/env node
// Decisions of the release workflow (spec 017, ADR 0008): which tags a run
// sets, whether a version tag is acceptable, what the release notes say.
// They live here, not in the workflow, so tests can call them.
//
// Usage, from the repository root:
//   node scripts/release.mjs plan
//       Reads GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_SHA and
//       GITHUB_REPOSITORY and writes image, version, build_version, tags and
//       release to $GITHUB_OUTPUT. A tag run also needs its changelog section.
//   node scripts/release.mjs notes --digest sha256:…
//       Prints the notes of the GitHub Release for the tag in GITHUB_REF_NAME.
//   node scripts/release.mjs chart-values --digest sha256:… <values.yaml>
//       Points a copy of the chart's values at the released image.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHANGELOG = 'CHANGELOG.md';
const RELEASE_TAG = /^v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHORT_COMMIT = 7;

/**
 * What a run of the release workflow publishes.
 * A push to main sets `edge`; a tag `vX.Y.Z` that equals the package version
 * sets `X.Y.Z`, `X.Y` and `latest`. Anything else is refused.
 */
export function plan({ refType, refName, sha, repository, version }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error(`'${sha}' is not a commit id.`);
  if (!repository) throw new Error('The repository name is missing.');
  if (!version) throw new Error('The root package.json has no version.');
  const base = {
    image: `ghcr.io/${repository.toLowerCase()}`,
    version,
    buildVersion: `${version}+${sha.slice(0, SHORT_COMMIT)}`,
  };

  if (refType === 'tag') {
    const match = RELEASE_TAG.exec(refName);
    if (!match) {
      throw new Error(
        `The tag '${refName}' is not a release tag. A release is tagged vX.Y.Z, for example v${version}.`,
      );
    }
    if (match[1] !== version) {
      throw new Error(
        `The tag '${refName}' does not match the version ${version} in the root package.json. ` +
          `Tag the commit that sets the version: v${version}.`,
      );
    }
    return { ...base, tags: [version, `${match[2]}.${match[3]}`, 'latest'], release: true };
  }
  if (refType === 'branch' && refName === 'main') {
    return { ...base, tags: ['edge'], release: false };
  }
  throw new Error(
    `Images are published from main and from vX.Y.Z tags, not from ${refType} '${refName}'.`,
  );
}

/**
 * The body of the changelog section of a version: the lines under
 * `## [X.Y.Z]` or `## X.Y.Z` (a date may follow) up to the next section.
 * `text` is the content of CHANGELOG.md, or null when the file does not exist.
 */
export function changelogSection(text, version) {
  const fix = `Add a section '## [${version}]' to ${CHANGELOG} in the commit that is tagged.`;
  if (text === null || text === undefined) {
    throw new Error(
      `${CHANGELOG} does not exist, so version ${version} has no release notes. ${fix}`,
    );
  }
  const lines = text.split(/\r?\n/);
  const escaped = version.replace(/[.+]/g, '\\$&');
  const heading = new RegExp(`^## \\[?v?${escaped}\\]?(\\s.*)?$`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    throw new Error(`${CHANGELOG} has no section for version ${version}. ${fix}`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end))
    // Link definitions at the foot of the file belong to no section.
    .filter((line) => !/^\[[^\]]+\]:\s+\S+$/.test(line))
    .join('\n')
    .trim();
  if (body === '') {
    throw new Error(
      `The section for version ${version} in ${CHANGELOG} is empty. Say what changed.`,
    );
  }
  return body;
}

/** The notes of the GitHub Release: the changelog, then the image and how to verify it. */
export function releaseNotes({ version, image, digest, repository, serverUrl, sha, changelog }) {
  if (!DIGEST.test(digest ?? '')) {
    throw new Error(`'${digest}' is not an image digest (sha256:<64 hex digits>).`);
  }
  const [major, minor] = version.split('.');
  const identity = `${serverUrl}/${repository}/.github/workflows/release.yml@refs/tags/v${version}`;
  return `${changelog}

## Container image

\`${image}:${version}\`, also \`${major}.${minor}\` and \`latest\`, for linux/amd64 and linux/arm64.

\`\`\`bash
docker pull ${image}@${digest}
\`\`\`

This is the image built from commit \`${sha}\` on \`main\`. It was started and played through, scanned for vulnerabilities and signed as exactly this digest; the release did not build it again. Its version reads \`${version}+${sha.slice(0, SHORT_COMMIT)}\`.

Verify the signature with [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) 3 or newer:

\`\`\`bash
cosign verify ${image}@${digest} \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \\
  --certificate-identity ${identity}
\`\`\`

## Files

- \`kritzel-${version}-linux-amd64.spdx.json\`, \`kritzel-${version}-linux-arm64.spdx.json\`: the software bill of materials of the image for each platform, as recorded when it was built: the operating system packages and Node.js. The npm packages are compiled into the server and the web app; they are the production dependencies of \`pnpm-lock.yaml\` at this tag.
- \`kritzel-*.tgz\`: the Helm chart, set to this image. \`helm install kritzel ./kritzel-*.tgz\` installs this release.
`;
}

/**
 * The chart's values with `image.tag` and `image.digest` set to the release,
 * so the packaged chart installs the image it was released with. Only those
 * two lines change; comments and everything else stay as they are.
 */
export function pinChartImage(values, { tag, digest }) {
  if (!DIGEST.test(digest ?? '')) {
    throw new Error(`'${digest}' is not an image digest (sha256:<64 hex digits>).`);
  }
  const lines = values.split('\n');
  const start = lines.findIndex((line) => /^image:\s*$/.test(line));
  if (start === -1) throw new Error('The values have no image block.');
  let end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  if (end === -1) end = lines.length;
  const set = (key, value) => {
    const index = lines.findIndex(
      (line, at) => at > start && at < end && new RegExp(`^  ${key}:(\\s|$)`).test(line),
    );
    if (index === -1) throw new Error(`The image block of the values has no ${key}.`);
    lines[index] = `  ${key}: '${value}'`;
  };
  set('tag', tag);
  set('digest', digest);
  return lines.join('\n');
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name} <value>.`);
  return value;
}

function context() {
  const env = process.env;
  return plan({
    refType: env.GITHUB_REF_TYPE,
    refName: env.GITHUB_REF_NAME,
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  });
}

const changelog = (version) =>
  changelogSection(existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : null, version);

function main([command, ...args]) {
  if (command === 'plan') {
    const planned = context();
    // A release without notes is refused here, before anything is published.
    if (planned.release) changelog(planned.version);
    const outputs = [
      `image=${planned.image}`,
      `version=${planned.version}`,
      `build_version=${planned.buildVersion}`,
      `tags=${planned.tags.join(' ')}`,
      `release=${planned.release}`,
    ];
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
    console.log(outputs.join('\n'));
  } else if (command === 'notes') {
    const planned = context();
    if (!planned.release) throw new Error('Release notes are written for a version tag only.');
    process.stdout.write(
      releaseNotes({
        version: planned.version,
        image: planned.image,
        digest: option(args, '--digest'),
        repository: process.env.GITHUB_REPOSITORY,
        serverUrl: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
        sha: process.env.GITHUB_SHA,
        changelog: changelog(planned.version),
      }),
    );
  } else if (command === 'chart-values') {
    const planned = context();
    const file = args.at(-1);
    const digest = option(args, '--digest');
    if (!file || file === digest) throw new Error('Name the values file to change.');
    writeFileSync(
      file,
      pinChartImage(readFileSync(file, 'utf8'), { tag: planned.version, digest }),
    );
  } else {
    throw new Error(
      'Usage: node scripts/release.mjs plan | notes --digest <digest> | chart-values --digest <digest> <values.yaml>',
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // An annotation on the run, and a plain line for a terminal.
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
}
