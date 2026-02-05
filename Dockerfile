# ==============================================================================
# Multi-Stage Dockerfile - Single Source of Truth
# ==============================================================================
# Stages:
#   1. deps        - Install ALL dependencies (shared cache)
#   2. development - Dev server with hot-reload
#   3. builder     - Build production assets
#   4. production  - Minimal production runtime
#
# Usage:
#   Dev:  docker build --target development -t app:dev .
#   Prod: docker build --target production -t app:prod .
# ==============================================================================

# =============================================================================
# Stage 1: DEPS - Shared dependency installation (cache layer)
# =============================================================================
FROM node:22-alpine AS deps

# Install build tools for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy only package files first (cache optimization)
COPY package.json yarn.lock ./

# Install ALL dependencies (dev + prod)
# This layer is cached and shared between dev and prod builds
RUN yarn install --frozen-lockfile && yarn cache clean

# =============================================================================
# Stage 2: DEVELOPMENT - Hot-reload dev server
# =============================================================================
FROM node:22-alpine AS development

# Install tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy dependencies from deps stage (cache hit!)
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Generate Prisma client and GraphQL types
RUN npx prisma generate && yarn generate

ENV NODE_ENV=development

EXPOSE 4000

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Start dev server with hot-reload
CMD ["yarn", "dev:docker"]

# =============================================================================
# Stage 3: BUILDER - Compile production assets
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage (cache hit!)
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Generate GraphQL types and build production bundle
RUN yarn generate && yarn build

# Prune dev dependencies, keeping only production deps
# Save Prisma client before pruning
RUN cp -R node_modules/.prisma ./.prisma-temp && \
  yarn install --production --frozen-lockfile && \
  yarn cache clean && \
  cp -R ./.prisma-temp node_modules/.prisma && \
  rm -rf ./.prisma-temp

# =============================================================================
# Stage 4: PRODUCTION - Minimal runtime image
# =============================================================================
FROM node:22-alpine AS production

# Install tini and curl for health checks
RUN apk add --no-cache tini curl && \
  addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed for production
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Run as non-root user
USER nodejs

EXPOSE 4000

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start production server
CMD ["node", "dist/index.cjs"]
