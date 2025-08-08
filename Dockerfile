# --- Stage 1: Builder ---
FROM node:20-bullseye AS builder

# Install system dependencies required for mediasoup build
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY pnpm-lock.yaml* ./

RUN pnpm config set network-timeout 600000 && \
    pnpm config set fetch-retry-mintimeout 60000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm config set registry https://registry.npmjs.org/ && \
    pnpm install --filter=server --frozen-lockfile=false

COPY apps/server/ ./apps/server/

RUN pnpm --filter=server build

RUN pnpm --filter=server --prod install


# --- Stage 2: Production ---
FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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