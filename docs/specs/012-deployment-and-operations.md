# 012 — Deployment and operations

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M4          |

## Intent

Hosting Kritzel must be boring: one image, one port, no state, no secrets. An operator who has run a container before needs nothing but the README.

## Behaviour

- `docker run -p 3000:3000 ghcr.io/<owner>/<repo>` starts a complete instance: web app, API and WebSocket endpoint on one port.
- The operator puts a TLS-terminating reverse proxy in front of it. The hosting guide (`docs/HOSTING.md`) has examples for Caddy, nginx and Traefik and notes for Fly.io, Railway and Render.
- A Helm chart is an optional second way to run the same image on a cluster ([spec 016](016-kubernetes-deployment.md)).
- Updating is pulling a new image and restarting. Running games end; players are told the server is restarting (spec 007).

## Rules

### Configuration

All configuration is by environment variable; every variable is optional.

| Variable      | Default   | Meaning                                                                                                                                         |
| ------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`        | `3000`    | Listening port                                                                                                                                  |
| `HOST`        | `0.0.0.0` | Listening address                                                                                                                               |
| `MAX_ROOMS`   | `500`     | Maximum number of live rooms                                                                                                                    |
| `TRUST_PROXY` | `false`   | Whose forwarded client address to believe: `true` (anyone's), or a comma-separated list of proxy addresses and networks such as `10.128.0.0/14` |
| `LOG_LEVEL`   | `info`    | `debug`, `info`, `warn`, `error`                                                                                                                |

Telemetry adds its own variables, all optional and off by default; they are listed in [spec 015](015-observability.md).

`TRUST_PROXY=true` believes whatever `X-Forwarded-For` says, including an address the client wrote itself, so one client can evade the per-address limits. A list names the proxies: the header is believed only on connections from them, and the address the proxy appended counts. A bare hop count is not accepted, because it cannot tell a proxy from a client that connects directly.

An invalid value stops the process at start-up with a message naming the variable.

### Image

- Multi-stage build; the runtime stage contains only the server bundle, production dependencies, the web build and the content.
- Runs as a non-root user; writes nothing to disk; has a `HEALTHCHECK` on `/healthz`.
- Published for `linux/amd64` and `linux/arm64`.
- Labelled with the OCI source, version and licence annotations.

### HTTP

- `/healthz` answers `200 {"status":"ok"}` without touching room state.
- Hashed assets are served with a one-year immutable cache header; `index.html` with `no-cache`.
- Unknown paths that are not files return `index.html` (SPA routing); unknown `/api` paths return 404 JSON.
- Security headers on every response: `Content-Security-Policy` restricted to `'self'` (plus `data:` and `blob:` for images and `ws:`/`wss:` to the same host), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

### Logging

- One JSON object per line on stdout: time, level, message, context.
- Logged: start-up configuration, room created and disposed (code only), participant counts, rejected messages by error code, shutdown.
- Never logged: nicknames, chat text, words, session tokens, IP addresses at `info` level.
- Inside a traced operation the line also carries `trace_id` and `span_id` (spec 015).

### CI and release

- **CI** on every pull request and on `main`: install, lint, type check, unit and integration tests, strict spec coverage, build, end-to-end tests. A further job starts the observability stack and checks it through its APIs (spec 015).
- **Release** on push to `main` and on `v*` tags, by promotion ([spec 017](017-release-and-supply-chain.md)): a commit of `main` is built once into the multi-architecture image and pushed to GHCR as the immutable `sha-<commit>`. That digest is tested, scanned and signed; only then does `edge` point to it. A `v*` tag builds nothing and points the version and `latest` at the image of its commit after the same checks.
- The tests against the container, including the game through a TLS proxy, are one reusable workflow that CI runs on an image built from the checkout and the release runs on the published digest.
- **Security checks** on every pull request, on `main` and weekly: dependency audit, dependency review, CodeQL, a secret scan and a rescan of the released image (spec 017).
- Workflows use the repository's `GITHUB_TOKEN` and, for signing, the run's OIDC token. No signing key or registry password is stored.
- Actions are pinned to commit ids and tool images to digests (spec 017).

### Capacity check

- A scripted load test (`pnpm loadtest`) simulates 30 rooms of 8 players each playing with drawing and chat traffic against a container limited to 1 vCPU and 512 MB, and reports event-loop delay and memory. The result is recorded in the hosting guide (`docs/HOSTING.md`).

## Acceptance criteria

- **AC-012-01** A container started from the image with no configuration serves the home page and `/healthz` on port 3000.
- **AC-012-02** With `PORT=8080` the server listens on 8080.
- **AC-012-03** With `MAX_ROOMS=2`, creating a third room fails with `server_full`.
- **AC-012-04** With `PORT=abc` the process exits non-zero with a message naming `PORT`.
- **AC-012-05** `/healthz` returns status 200 and the body `{"status":"ok"}`.
- **AC-012-06** `GET /r/ABCDEF` returns the app's `index.html`; `GET /api/unknown` returns 404 with a JSON body.
- **AC-012-07** Every response carries the three security headers, and the Content-Security-Policy allows no origin other than the app's own.
- **AC-012-08** The container's process runs with a non-zero user id.
- **AC-012-09** A full game is playable through a reverse proxy that terminates TLS, using Caddy as documented in the hosting guide.
- **AC-012-10** After a full game at `info` level, the logs contain no nickname, chat text or word used in that game.
- **AC-012-11** The container stops within 10 s of `SIGTERM` with exit code 0.
- **AC-012-12** The CI workflow fails when lint, type check, any test, strict spec coverage or the build fails.
- **AC-012-13** The release workflow publishes an image manifest for `linux/amd64` and `linux/arm64`.
- **AC-012-14** The load test completes against the resource-limited container without a dropped connection, and its result is recorded in the hosting guide.
- **AC-012-15** The README's quick start, followed literally on a machine with only Docker installed, results in a playable game.

## Out of scope

Built-in TLS, a scrape endpoint for metrics (telemetry is pushed, spec 015), multi-instance deployments, automatic updates.
