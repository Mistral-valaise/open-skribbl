# Changelog

Notable changes to Kritzel, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A release is the image `ghcr.io/mistral-valaise/open-skribbl:<version>`; [`docs/HOSTING.md`](docs/HOSTING.md) explains the tags.

## [1.0.0] - 2026-11-27

The first release: the complete game, a way to host it in one command, and a release process that publishes only an image that was tested, scanned and signed.

### The game

- Private rooms by link or six-character code for 2 to 12 players plus spectators, with host settings for rounds, draw time, word choices, hints, difficulty and custom words.
- Drawing with brush, eraser, fill, undo, redo and clear on mouse, touch and stylus; the same picture for everyone.
- Guessing that tolerates accents, umlauts and spacing, with close-guess notices and a separate chat for players who already guessed.
- Scoring by speed: 100 to 500 points for a guess, 50 more for the first one, and for the drawer half of what the guessers average, so that a game for two is not a permanent tie.
- Reconnect without losing points, late join, host migration, reactions, likes, a podium and a gallery of all drawings with PNG download.
- Solo mode against the computer with a personal best.
- English, German, Spanish and French, for the interface and the word lists.
- Dark and light theme, layouts from phone to desktop, keyboard and screen-reader support. On a phone the drawing, the newest chat line and the input stay in view while the keyboard is open.
- No ads, no accounts, no tracking: every request goes to the server that hosts the game.

### Hosting and operations

- One container image for `linux/amd64` and `linux/arm64` that needs no database and no configuration.
- Optional OpenTelemetry metrics, traces and logs over OTLP/HTTP, off by default, with a local stack of collector, Prometheus, Loki, Tempo and Grafana, dashboards, and service level objectives generated with Sloth.
- A Helm chart for Kubernetes and OpenShift, and a workflow that deploys a demo to the OpenShift Developer Sandbox.

### Release and security

- Releases promote an image instead of building one: the image of a commit is built once, played through by the test suite, scanned with Trivy and signed with cosign before `latest`, the version tags or `edge` point to it.
- Every release carries a software bill of materials and build provenance, and states the digest it was made from.
- Dependency audit, dependency review, CodeQL and a secret scan run on every change and weekly; the released image is rescanned weekly.
- Every GitHub Action and tool image the workflows use is pinned to a commit or digest.

### Credits

- Created by [Mistral N](https://mistraln.de/). The interface names its author in the footer of the home, join and solo screens.

[1.0.0]: https://github.com/Mistral-valaise/open-skribbl/releases/tag/v1.0.0
