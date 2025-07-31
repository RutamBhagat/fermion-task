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

# Copy package files
COPY apps/server/package.json ./package.json
COPY package-lock.json ./package-lock.json

# Install all dependencies
RUN npm install

# Copy server source code
COPY apps/server/ ./

# Build the application
RUN npm run build


# --- Stage 2: Production ---
# Final lean image
FROM node:20-alpine

RUN apk add --no-cache python3 ffmpeg

WORKDIR /app

# Copy only the production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the server's package.json
COPY --from=builder /app/package.json ./package.json

# Copy the compiled application code from the builder stage
COPY --from=builder /app/dist ./dist

# Create directory for HLS files
RUN mkdir -p hls

# Expose ports
EXPOSE 3000
EXPOSE 10000-10100/udp

# Start the server
CMD ["npm", "start"]