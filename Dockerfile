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

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY apps/server/package.json ./apps/server/

# Install all dependencies with increased timeouts for mediasoup compilation
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 60000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --workspace=apps/server --verbose

COPY apps/server/ ./apps/server/

# Build the application
RUN npm run build --workspace=server

RUN npm prune --production --workspace=apps/server


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

CMD ["npm", "start"]