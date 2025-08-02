# --- Stage 1: Builder ---
FROM node:20-alpine AS builder

# Install system dependencies required for mediasoup build
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    gcc \
    libc-dev \
    pkgconfig \
    openssl-dev \
    linux-headers

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration and root package.json
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/

# Install dependencies with pnpm (includes mediasoup compilation)
# Use --frozen-lockfile=false since we might not have pnpm-lock.yaml yet
RUN pnpm config set network-timeout 600000 && \
    pnpm config set fetch-retry-mintimeout 60000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm install --filter=server --frozen-lockfile=false

COPY apps/server/ ./apps/server/

# Build the application
RUN pnpm --filter=server build

# Prune dev dependencies
RUN pnpm --filter=server --prod install


# --- Stage 2: Production ---
# Final lean image
FROM node:20-alpine

RUN apk add --no-cache python3 ffmpeg

WORKDIR /app

# Copy only the production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the server's package.json
COPY --from=builder /app/apps/server/package.json ./package.json

# Copy the compiled application code from the builder stage
COPY --from=builder /app/apps/server/dist ./dist

# Create directory for HLS files
RUN mkdir -p hls

# Expose ports
EXPOSE 3000
EXPOSE 10000-10100/udp

CMD ["node", "dist/index.js"]