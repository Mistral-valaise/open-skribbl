# A release promotes an image that was already built and tested

Until now the release workflow built the image twice: once for `main` and again for a `v*` tag, and pushed it under its final tags in the same step. Nothing ran against the pushed image; CI tested a different build of the same commit. `latest` therefore named bytes that no test had ever started.

We build the image once per commit of `main`, push it only as `sha-<commit>`, and treat its digest as the unit of release. The tests, the vulnerability scan and the signature all address that digest. Moving tags (`edge`, the version, `latest`) are set afterwards with `docker buildx imagetools create`, which writes a tag for an existing manifest and builds nothing. A version tag in git does not build either: it looks up the image of its commit, runs the same checks on it again and promotes it ([spec 017](../specs/017-release-and-supply-chain.md)).

The signature is keyless cosign: it is bound to the OIDC identity of the release workflow and logged publicly, so there is no signing key to store, rotate or leak. Because signing comes after the tests and the scan, a valid signature is also the statement that this digest passed them.

## Considered options

- **Build again on the tag** (the previous workflow): simple, but two builds of one commit are different images. Base image updates, the registry cache and timestamps all change the result, so the release would not be the image that was tested on `main`.
- **Build, load into the runner, test, then push**: tests the bytes before anything is published, but a multi-architecture image cannot be loaded into the local Docker daemon as one image, so the tested image and the pushed manifest would again differ. Pushing under a tag nobody consumes by accident (`sha-<commit>`) and testing by digest avoids that.
- **Promote on the tag without repeating the checks**, trusting the run on `main`: faster, but the tag run would have to prove that the earlier run passed for this digest, and a vulnerability published between the two would go unnoticed. Repeating the checks costs a few minutes per release.
- **A signing key in a repository secret**: works offline, but the key becomes the thing to protect, and a leaked key signs anything. Keyless signing leaves nothing to steal between runs.
- **A release tool that raises the version and tags by itself**: out of proportion for one image and one maintainer. A person edits the version and the changelog and pushes the tag; the workflow refuses a tag that does not match.

## Consequences

- `sha-<commit>` exists before the image is tested. Consumers who need a guarantee use `edge`, `latest`, a version, or verify the signature; the hosting guide says so.
- A released image reports the version it was built with, `X.Y.Z+<commit>`, because it is not rebuilt to change a label.
- A tag pushed before the run of its commit on `main` has built the image fails with a message, and is started again once the image exists.
- The first image of a commit and its release are the same digest, so the software bill of materials and the provenance attestation made at build time describe the release exactly.
- The release workflow cannot be exercised from a branch. Its decisions (tags, version match, changelog section, release notes) live in `scripts/release.mjs` with unit tests; the commands that talk to the registry are proven by the first run on `main` and the first tag.
- Tool images pinned inside scripts are not raised by Dependabot and need a manual update from time to time.
