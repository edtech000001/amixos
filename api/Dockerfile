# Multi-stage build for the Amixos Express API.
#
#   build stage   → installs ALL deps (incl. typescript) and compiles
#                   TS → dist/.
#   runtime stage → installs only prod deps, copies in dist/, runs.
#
# Separating the stages keeps the final image small (no TS toolchain,
# no devDependencies) and makes it cheaper to push/pull on every deploy.

# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy package manifests first so docker can cache `npm install` when
# only source files change.
COPY package.json ./

RUN npm install

# Bring in the TS source + config and compile.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ── Runtime stage ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Production deps only.
COPY package.json ./
RUN npm install --omit=dev

# Compiled JS from the build stage.
COPY --from=builder /app/dist ./dist

# Drop root: run as the unprivileged `node` user that the base image ships.
# Limits the blast radius if the process is ever compromised.
USER node

# Cloud Run injects $PORT (typically 8080) and the server listens on it
# via `process.env.PORT || 3001`. EXPOSE is informational — Cloud Run
# auto-detects the port the container binds to.
EXPOSE 8080

CMD ["node", "dist/index.js"]
