# --- Stage 1: build the client -------------------------------------------------
FROM oven/bun:1.3-alpine AS build-client
WORKDIR /app/client
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile
COPY client/ ./
RUN bun run build

# --- Stage 2: install production server deps -----------------------------------
FROM oven/bun:1.3-alpine AS build-server
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

# --- Stage 2b: build the Go agent ----------------------------------------------
FROM golang:1.24-alpine AS build-agent
WORKDIR /src
COPY agent/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /voidbackups-agent-linux_amd64 . && \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o /voidbackups-agent-linux_arm64 .

# --- Stage 3: runtime -----------------------------------------------------------
FROM oven/bun:1.3-alpine

# Install restic for backup operations
RUN apk add --no-cache restic

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build-client /app/client/dist ./client/dist
COPY --from=build-server /app/server/node_modules ./server/node_modules
COPY server/ ./server

# Copy pre-built agent binaries
COPY --from=build-agent /voidbackups-agent-linux_amd64 /app/releases/voidbackups-agent-linux_amd64
COPY --from=build-agent /voidbackups-agent-linux_arm64 /app/releases/voidbackups-agent-linux_arm64

# Copy .env if it exists (will be overridden by docker-compose env_file)
COPY .env* ./

WORKDIR /app/server
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3010/health || exit 1

CMD ["bun", "src/index.ts"]
