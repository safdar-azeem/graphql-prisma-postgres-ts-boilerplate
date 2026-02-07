# Docker Guide

Complete guide for running the GraphQL API with Docker.

## Quick Start

```bash
# Development
yarn docker:dev          # Start dev environment
yarn docker:migrate      # Run database migrations
yarn docker:dev:logs     # View logs

# Production
yarn docker:prod         # Start prod environment
yarn docker:prod:logs    # View logs
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   http://localhost:3001                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   NGINX (Load Balancer)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │   App 1     │ │   App 2     │ │   App 3     │
   │  (Port 4200)│ │  (Port 4200)│ │  (Port 4200)│
   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
          │               │               │
          └───────────────┼───────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   ┌─────────────┐                 ┌─────────────┐
   │    Redis    │                 │  PostgreSQL │
   │   (Cache)   │                 │   (Shards)  │
   └─────────────┘                 └─────────────┘
```

## Files

| File                      | Purpose                        |
| ------------------------- | ------------------------------ |
| `Dockerfile`              | Multi-stage build (dev + prod) |
| `docker-compose.yml`      | Development environment        |
| `docker-compose.prod.yml` | Production environment         |
| `.env`                    | Environment configuration      |
| `nginx/nginx.conf`        | Load balancer config           |

## Dockerfile Stages

The single Dockerfile uses multi-stage builds:

```dockerfile
# Stage 1: deps - Install dependencies (shared cache)
# Stage 2: development - Dev server with hot-reload
# Stage 3: builder - Compile production assets
# Stage 4: production - Minimal runtime image
```

Benefits:

- **Single source of truth** - Update Node.js version in one place
- **Faster builds** - Shared deps layer is cached
- **No mistakes** - Same `yarn install` for dev and prod

## Commands Reference

### Development

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `yarn docker:dev`       | Start dev environment (3 replicas) |
| `yarn docker:dev:build` | Rebuild and start dev              |
| `yarn docker:dev:logs`  | View dev logs                      |
| `yarn docker:dev:down`  | Stop dev containers                |
| `yarn docker:migrate`   | Run migrations                     |
| `yarn docker:sh`        | Shell into container               |

### Production

| Command                  | Description            |
| ------------------------ | ---------------------- |
| `yarn docker:prod`       | Start prod environment |
| `yarn docker:prod:build` | Rebuild and start prod |
| `yarn docker:prod:logs`  | View prod logs         |
| `yarn docker:prod:down`  | Stop prod containers   |

### Maintenance

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `yarn docker:clean` | Remove all volumes and images |

## Scaling

```bash
# Scale to 5 app replicas
docker compose up -d --scale app=5

# Production scaling
docker compose -f docker-compose.prod.yml up -d --scale app=5
```

## Environment Variables

All configuration is in `.env`:

| Variable             | Description               | Default          |
| -------------------- | ------------------------- | ---------------- |
| `DATABASE_URL`       | Main database connection  | postgres:5432    |
| `SHARD_COUNT`        | Number of database shards | 3                |
| `REDIS_HOST`         | Redis hostname            | redis            |
| `JWT_SECRET`         | JWT signing secret        | (change in prod) |
| `MFA_ENCRYPTION_KEY` | 32-char encryption key    | (change in prod) |

## Troubleshooting

### Container won't start

```bash
yarn docker:dev:logs    # Check for errors
yarn docker:clean       # Reset everything
yarn docker:dev         # Try again
```

### Port already in use

```bash
lsof -i :3001           # Find process
kill -9 <PID>           # Kill it
```

### Database connection issues

```bash
docker compose exec postgres psql -U postgres -c "\l"
```

### Reset everything

```bash
yarn docker:clean
yarn docker:dev
yarn docker:migrate
```
