# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────
# Runs on the machine's own platform, once for every target platform: what it
# produces is JavaScript and static files, the same everywhere, and Node.js
# under emulation is slow and can crash (spec 017).
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile

COPY . .
# Reported as `service.version` when telemetry is on (spec 015).
ARG KRITZEL_VERSION=0.0.0
ENV KRITZEL_VERSION=${KRITZEL_VERSION}
RUN pnpm build

# ── runtime ──────────────────────────────────────────────────────────────
# The server is one bundled file; the image carries no node_modules.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# The server is `node main.js` and nothing else. The package managers of the
# base image are never run here, and their modules are where the image scan
# finds vulnerabilities (spec 017), so they do not ship.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=build /app/apps/server/dist ./
COPY --from=build /app/apps/web/dist ./web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "main.js"]
