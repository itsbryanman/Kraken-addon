# ============================================================================
# KRAKEN ADDON - DOCKER BUILD
# ============================================================================
# Multi-stage build for minimal production image

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Add labels
LABEL org.opencontainers.image.title="Kraken Addon"
LABEL org.opencontainers.image.description="The Ultimate Stremio Torrent Aggregator"
LABEL org.opencontainers.image.source="https://github.com/itsbryanman/Kraken-addon"
LABEL org.opencontainers.image.version="1.0.0"

# Create non-root user
RUN addgroup -g 1001 -S kraken && \
    adduser -u 1001 -S kraken -G kraken

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY docs/ ./docs/
COPY public/ ./public/

# Set ownership
RUN chown -R kraken:kraken /app

# Switch to non-root user
USER kraken

# Environment variables
ENV NODE_ENV=production
ENV PORT=7000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 7000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:7000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
