# =========================================================
# Yimly FamilyCal - Standalone Self-Hosted Dockerfile
# =========================================================

# Stage 1: Build Frontend and Server
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies deterministically using lockfile
RUN npm ci

# Copy source files
COPY . .

# Build Vite client assets and bundle Express TypeScript server with esbuild
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Create data directory for SQLite database persistence
RUN mkdir -p /data

# Copy production artifacts from builder
COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

# Expose container port
EXPOSE 3000

# Declare persistent volume
VOLUME ["/data"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Production Start Command
CMD ["node", "dist/server.cjs"]
