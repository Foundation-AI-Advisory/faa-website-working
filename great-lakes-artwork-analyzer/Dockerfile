# Great Lakes Label — Artwork Intelligence & Approval
#
# Multi-stage so the shipped image carries production dependencies only.
# better-sqlite3 is a native module, so the build stage has a toolchain; the
# runtime stage reuses the same base image so the compiled binding matches.

# ---------- dependencies (including dev, for the build) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# ---------- build the server and client ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---------- production dependencies only ----------
FROM node:22-bookworm-slim AS proddeps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4180 \
    GLL_DATA_DIR=/var/gll/data \
    GLL_STORAGE_DIR=/var/gll/storage
WORKDIR /app

COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# Uploaded originals and the SQLite database live here. Mount a volume on this
# path in production, or every redeploy starts from an empty database.
RUN mkdir -p /var/gll/data /var/gll/storage && chown -R node:node /var/gll /app
USER node

EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4180)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
