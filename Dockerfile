# ==============================================================================
# Stage 1: Base dependencies (cached layer for faster rebuilds)
# ==============================================================================
FROM node:22-alpine AS deps

# Install build dependencies for native modules (bcrypt, pg)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy only package files first (maximizes cache hits)
COPY package.json yarn.lock ./

# Install all dependencies
RUN yarn install --frozen-lockfile && yarn cache clean

# ==============================================================================
# Stage 2: Development (with nodemon hot-reload)
# ==============================================================================
FROM node:22-alpine AS development

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client and GraphQL types
RUN yarn generate

EXPOSE 4000

# Use nodemon for development hot-reload
CMD ["yarn", "dev:docker"]

# ==============================================================================
# Stage 3: Production build
# ==============================================================================
FROM node:22-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate types and build production bundle
RUN yarn generate && yarn build

# Prune dev dependencies for smaller production image
RUN yarn install --production --frozen-lockfile && yarn cache clean

# ==============================================================================
# Stage 4: Production runtime (minimal footprint)
# ==============================================================================
FROM node:22-alpine AS production

# Security: Don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed for production
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

USER nodejs

EXPOSE 4000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/graphql?query=%7B__typename%7D', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "dist/index.js"]
