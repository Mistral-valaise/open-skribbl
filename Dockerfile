# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── runtime ──────────────────────────────────────────────────────────────
# The server is one bundled file; the image carries no node_modules.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build /app/apps/server/dist ./
COPY --from=build /app/apps/web/dist ./web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "main.js"]
