# 017 — Release and supply chain

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M7          |

## Intent

An operator who pulls `latest` must get an image that was tested, scanned and signed as exactly those bytes, and must be able to check that without trusting the registry. A contributor must not be able to weaken that by accident: what a workflow runs is pinned, and known vulnerabilities and leaked secrets are found before a release, not after.

## Behaviour

- Every commit on `main` is built once into a multi-architecture image and pushed under the immutable tag `sha-<commit>`. That digest is then started and played through, scanned and signed. Only after all three does `edge` point to it.
- A release is the tag `vX.Y.Z` on a commit of `main`. The tag builds nothing: it takes the image that commit already has, puts it through the same tests, scan and signature again, and then points `X.Y.Z`, `X.Y` and `latest` at the same digest. It ends with a GitHub Release carrying the changelog section, the digest, the command to verify the signature, the software bill of materials and the Helm chart.
- A pull request cannot merge code with a known high-severity vulnerability in a production dependency, a newly added vulnerable dependency or a secret without a check turning red. Published images are scanned again every week, because vulnerabilities are found after a release too.
- The reasons for building once and promoting are in [ADR 0008](../adr/0008-release-by-promotion.md).

## Rules

### What each tag means

| Tag            | Points to                                                  | Moves                   |
| -------------- | ---------------------------------------------------------- | ----------------------- |
| `sha-<commit>` | The image built from that commit of `main`                 | Never                   |
| `edge`         | The newest commit of `main` that passed tests and the scan | On every push to `main` |
| `X.Y.Z`        | The release of that version                                | Never                   |
| `X.Y`          | The newest release of that minor version                   | With each patch release |
| `latest`       | The newest release                                         | With each release       |

`sha-<commit>` exists as soon as the image is built, before it is tested. Whether an image passed is told by its signature, not by this tag: only an image that passed is signed.

### Build

- Platforms `linux/amd64` and `linux/arm64`, one build, one push, the single tag `sha-<commit>` with the full 40-character commit id.
- BuildKit attaches a software bill of materials (SPDX) and a provenance attestation (`mode=max`) for each platform.
- The build argument `KRITZEL_VERSION` is `<version>+<short commit>`: the version of the root `package.json` and the first 7 characters of the commit, for example `1.0.0+3f2a9c1`. A released image keeps this value; it is not rebuilt to change it.
- The build stage runs on the platform of the machine that builds (`--platform=$BUILDPLATFORM`), once for both images. What it produces, the server bundle and the web app, is JavaScript and static files and is the same for every platform, so installing and compiling under emulation would only add time and the crashes of an emulated Node.js. The runtime stage is built for each target platform; the only command it runs is the removal below.
- The runtime stage contains no package manager. The `npm`, `npx`, `corepack` and `yarn` commands of the base image and their modules are removed, because the server is one bundled file and never runs them.

### Checks on the digest

All three address the image as `<repository>@sha256:…`, never by tag.

1. **Tests.** The image is started and the container tests and the game through a TLS-terminating proxy run against it (spec 012, AC-012-01, AC-012-08, AC-012-09). These steps are one reusable workflow, `.github/workflows/image-test.yml`, with the input `image`. CI calls it without a value, which builds the image from the checkout; the release calls it with the digest.
2. **Scan.** Trivy, vulnerabilities only, severities `CRITICAL` and `HIGH`, ignoring those without a fixed version. Any finding fails the run. The command is `scripts/scan-image.sh <image>`.
3. **Signature.** cosign, keyless: the signature is bound to the workflow's OIDC identity and recorded in the public transparency log. No key is stored anywhere. The run then verifies its own signature with the command the release notes give, and makes a GitHub build provenance attestation for the same digest. This step runs only when 1 and 2 passed.

An exception to the scan is a line in `.trivyignore`: the identifier, then `exp:YYYY-MM-DD`, with the reason in a comment directly above. Trivy stops honouring an entry on its expiry date, so an exception is never permanent.

### Promotion

- Tags are set with `docker buildx imagetools create` on the digest. Nothing is built or pushed again, and the step fails if the tag does not resolve to the tested digest afterwards.
- On `main`: `edge`, and only if the commit is still the head of `main`, so an older run that finishes late cannot move `edge` backwards.
- On a tag: `X.Y.Z`, `X.Y` and `latest`.

### Release tags

Before anything is published, a tag run stops with a message that names the problem when

- the tag is not `v` followed by three numbers (`v1.2.3`),
- the tag is not `v` plus the version in the root `package.json`,
- the commit is not on `main`,
- `CHANGELOG.md` has no section for the version (a heading `## [X.Y.Z]` or `## X.Y.Z`, optionally followed by a date), or the section is empty,
- no `sha-<commit>` image exists for the commit. The release run of that commit on `main` has to finish first; then the tag run is started again.

### GitHub Release

Created only by a tag run, after promotion. Title `Kritzel X.Y.Z`. The notes are the changelog section, followed by the image name, its digest and a `cosign verify` command with the workflow identity. Assets:

- the software bill of materials of each platform, extracted from the image, as `kritzel-X.Y.Z-linux-amd64.spdx.json` and `kritzel-X.Y.Z-linux-arm64.spdx.json`;
- the standalone Helm chart packaged from `deploy/helm/kritzel`, with `appVersion` set to the version and `image.tag` and `image.digest` set to the released image, so the chart installs the release it came with (also pushed as an OCI artifact to `oci://ghcr.io/<owner>/charts/kritzel`);
- every file in `marketing/promo/dist/`, when that directory exists.

### Permissions

The default of every workflow is `contents: read`. The reusable image test declares none: a called workflow receives what its caller grants and can only narrow it. In the release workflow a job gets more only for what it does:

| Job       | Extra permission                                            |
| --------- | ----------------------------------------------------------- |
| `plan`    | `packages: read`                                            |
| `build`   | `packages: write`                                           |
| `test`    | `packages: read`                                            |
| `scan`    | `packages: read`                                            |
| `sign`    | `packages: write`, `id-token: write`, `attestations: write` |
| `promote` | `packages: write`                                           |
| `release` | `contents: write`, `packages: write`                        |

`attestations: write` appears nowhere else. `id-token: write` appears only on `release.yml#sign` (for keyless cosign/attestation) and `scorecard.yml#analysis` (for publishing OpenSSF Scorecard results). Workflows use the repository's `GITHUB_TOKEN` and the run's OIDC token and no other secret, except the deployment workflow's cluster credentials (spec 016).

### Time limits

Every job of every workflow has a time limit (`timeout-minutes`), so a step that stalls ends the run as failed instead of holding it open for the six hours GitHub allows by default. In the release workflow, the limits are several times what a job normally takes:

| Job                                       | Limit      |
| ----------------------------------------- | ---------- |
| `build`                                   | 30 minutes |
| `test` (the job of the reusable workflow) | 20 minutes |
| every other job                           | 10 minutes |

The limit of `test` is set in `image-test.yml`, because a job that calls a workflow cannot carry one; it therefore applies to CI as well. A run that ends this way has published nothing beyond `sha-<commit>`, and is started again.

### Security checks

`.github/workflows/security.yml` runs on every pull request, on every push to `main` and every Monday.

| Check             | When                        | Fails on                                                                    |
| ----------------- | --------------------------- | --------------------------------------------------------------------------- |
| Dependency audit  | Always                      | `pnpm audit --prod --audit-level high` reporting a vulnerability            |
| Dependency review | Pull requests               | A dependency added by the pull request with a vulnerability of high or more |
| CodeQL            | Always                      | Results appear under code scanning; the analysis itself must succeed        |
| Secret scan       | Always                      | gitleaks finding a secret anywhere in the history of the checked-out commit |
| Image rescan      | Mondays, or started by hand | The scan rule above applied to the `latest` image                           |

Before the first release there is no `latest` image; the rescan says so and passes.

Dependabot proposes updates every week for npm packages, GitHub Actions and the Docker base image. `SECURITY.md` says how to report a vulnerability privately and which versions get fixes.

### Pinning

- Every action from outside this repository is referenced by its full 40-character commit id, followed by a comment with the version: `uses: actions/checkout@<sha> # v7.0.1`. A tag can be moved; a commit id cannot.
- Container images that a workflow or a script runs as a tool (actionlint, Trivy, gitleaks, the Caddy proxy of the image tests) are referenced by version and digest.
- Binaries a workflow downloads are verified by checksum (spec 016).

## Acceptance criteria

- **AC-017-01** A push to `main` builds the image for `linux/amd64` and `linux/arm64` in one step, with an SBOM and `mode=max` provenance, and pushes it under exactly one tag, `sha-<commit>`.
- **AC-017-02** The build receives `KRITZEL_VERSION=<version of the root package.json>+<first 7 characters of the commit>`.
- **AC-017-03** The container and TLS-proxy tests are defined once, in a reusable workflow with the input `image`; CI calls it without an image and the release workflow calls it with the digest of the image it built.
- **AC-017-04** The image scan reports only `CRITICAL` and `HIGH` vulnerabilities that have a fix, exits non-zero when it finds one, and the release runs it against the digest.
- **AC-017-05** Every entry of `.trivyignore` is an identifier followed by `exp:YYYY-MM-DD` and has a comment with the reason on the line above.
- **AC-017-06** The digest is signed with keyless cosign in a job that runs only after the tests and the scan succeeded and that verifies the signature with the workflow's identity; no other job of any workflow has `id-token: write` or `attestations: write`.
- **AC-017-07** Moving tags are set by `docker buildx imagetools create` on the digest in a job that runs only after signing and contains no build; the job fails when a tag does not resolve to that digest afterwards.
- **AC-017-08** A run on `main` plans the tag `edge`; a run on the tag `vX.Y.Z` plans `X.Y.Z`, `X.Y` and `latest`.
- **AC-017-09** `edge` is set only while the commit is the head of `main`.
- **AC-017-10** A tag that is not `vX.Y.Z`, or that differs from the version in the root `package.json`, is refused with a message naming both values.
- **AC-017-11** A tag run refuses a commit that is not on `main` and a commit without a `sha-<commit>` image, and has no build step.
- **AC-017-12** The changelog section of a version is found under `## [X.Y.Z]` or `## X.Y.Z` with an optional date; a missing file, a missing section and an empty section are each refused with a message naming the version and `CHANGELOG.md`.
- **AC-017-13** The release notes contain the changelog section, the image digest and a `cosign verify` command for that digest with the OIDC issuer and the identity of the release workflow.
- **AC-017-14** The GitHub Release is created only on a tag, after promotion, with the SPDX SBOM of both platforms, the packaged Helm chart and the files of `marketing/promo/dist/` when it exists.
- **AC-017-15** The packaged chart's values name the released version as `image.tag` and the released digest as `image.digest`.
- **AC-017-16** Every workflow started by an event defaults to `contents: read`, the reusable workflow declares no permissions, and each job of the release workflow has exactly the permissions of the table above.
- **AC-017-17** The security workflow runs on pull requests, on pushes to `main` and weekly, and audits production dependencies with `pnpm audit --prod --audit-level high`.
- **AC-017-18** Dependency review runs on pull requests only and fails on high severity.
- **AC-017-19** CodeQL analyses JavaScript and TypeScript on pull requests, on pushes to `main` and weekly.
- **AC-017-20** The secret scan runs gitleaks from a container image pinned by digest over the full history and fails on a finding.
- **AC-017-21** The `latest` image is scanned every week with the same script as the release, and a missing `latest` image passes with a notice.
- **AC-017-22** Dependabot is configured for npm, GitHub Actions and Docker with a weekly schedule.
- **AC-017-23** `SECURITY.md` says how to report a vulnerability privately and which versions are supported.
- **AC-017-24** In every workflow file, every action from outside the repository is pinned to a 40-character commit id followed by a version comment.
- **AC-017-25** Every container image a workflow or scan script runs as a tool is referenced with a version and a `sha256` digest.
- **AC-017-26** The runtime image contains no `npm`, `npx`, `corepack` or `yarn`.
- **AC-017-27** The hosting guide explains what `latest`, `edge`, `sha-<commit>` and version tags mean, how to verify a signature and how to roll back.
- **AC-017-28** Every job of the release workflow ends after a time limit: 30 minutes for `build`, 20 minutes for the job of the reusable image test, 10 minutes for every other job.
- **AC-017-29** The build stage of the image runs on the build platform, the runtime stage on the target platform, and the runtime stage runs no command other than removing files.
- **AC-017-30** Every job of every workflow sets an explicit `timeout-minutes` limit.
- **AC-017-31** A tag release publishes the packaged standalone `kritzel` Helm chart as an OCI artifact to `oci://ghcr.io/<owner>/charts` alongside the GitHub Release asset, and the release notes include the OCI install command.
- **AC-017-32** OpenSSF Scorecard runs on pushes to `main` and weekly with a pinned `ossf/scorecard-action`, uploads SARIF results, publishes results, and `README.md` displays the Scorecard badge.
- **AC-017-33** Both stages of `Dockerfile` pin the base image by `sha256` digest.
- **AC-017-34** `prepare-release.yml` (`workflow_dispatch`) and `scripts/release-prepare.mjs` bump `package.json` and the Helm `Chart.yaml` files and draft `CHANGELOG.md`; CI verifies `package.json` version matches `Chart.yaml` `appVersion`.

## Out of scope

- Pre-releases (`v1.2.3-rc.1`) and maintenance releases of an older minor version; a tag run always moves `latest`.
- Raising the version, writing the changelog and pushing the tag. A person does that.
- Signing the Helm chart, publishing it to a chart repository, and publishing npm packages.
- A bill of materials of the npm packages inside the server bundle and the web app. The image's SBOM lists what the image contains, the operating system packages and Node.js; the bundled packages are the production dependencies of `pnpm-lock.yaml`, which the dependency audit covers.
- Updating tool images that are pinned inside scripts and `run` steps: Dependabot does not see them, so they are raised by hand.
- Verifying the signature at deployment time. The deployment workflow of spec 016 deploys a commit of `main` by digest once CI passed; it does not wait for the signature.
- Tests of the `linux/arm64` image. The tests run on an `amd64` runner.
- Repository settings: branch protection, required checks and who may push tags are set by the owner.
