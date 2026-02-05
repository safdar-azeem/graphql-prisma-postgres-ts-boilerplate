# Docker & Production Deployment Guide

Complete step-by-step guide for running this GraphQL API with Docker, Nginx load balancing, and production deployment.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Docker Commands Reference](#docker-commands-reference)
4. [Understanding the Architecture](#understanding-the-architecture)
5. [Scaling the Application](#scaling-the-application)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

| Tool           | Version | Check Command            |
| -------------- | ------- | ------------------------ |
| Node.js        | v20+    | `node --version`         |
| Yarn           | v1.22+  | `yarn --version`         |
| Docker         | v24+    | `docker --version`       |
| Docker Compose | v2.20+  | `docker compose version` |

---

## Development Setup

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd graphql-prisma-postgres-ts-boilerplate
```

### Step 2: Start Docker Containers

This will start all services (PostgreSQL, Redis, Nginx, and 3 app replicas):

```bash
yarn docker:dev
```

**First run takes ~7 minutes** to build the Docker image and install dependencies.  
**Subsequent runs take ~10 seconds** (uses cached image).

### Step 3: Wait for Services to be Healthy

Check that all containers are running:

```bash
docker compose ps
```

Expected output:

```
NAME                                         STATUS              PORTS
nginx-lb                                     Up                  0.0.0.0:3001->80/tcp
graphql-prisma-postgres-ts-boilerplate-app-1 Up
graphql-prisma-postgres-ts-boilerplate-app-2 Up
graphql-prisma-postgres-ts-boilerplate-app-3 Up
postgres                                     Up (healthy)        0.0.0.0:5432->5432/tcp
redis                                        Up (healthy)        0.0.0.0:6379->6379/tcp
```

### Step 4: Run Database Migrations

Apply the schema to all database shards:

```bash
yarn docker:migrate
```

Expected output:

```
✅ shard_1
✅ shard_2
✅ shard_3
Total: 3 | Success: 3 | Failed: 0
```

### Step 5: Verify the Application

Open your browser or use curl:

```bash
# Test GraphQL endpoint
curl http://localhost:3001/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'

# Expected: {"data":{"__typename":"Query"}}
```

**GraphQL Playground:** http://localhost:3001/graphql

### Step 6: View Logs (Optional)

Monitor application logs in real-time:

```bash
yarn docker:logs
```

Press `Ctrl+C` to exit.

---

## Docker Commands Reference

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `yarn docker:dev`       | Start all containers in detached mode      |
| `yarn docker:dev:build` | Rebuild image and start containers         |
| `yarn docker:dev:scale` | Start with 5 app replicas                  |
| `yarn docker:migrate`   | Run database migrations on all shards      |
| `yarn docker:logs`      | View logs from all containers              |
| `yarn docker:down`      | Stop all containers                        |
| `yarn docker:clean`     | Stop containers, remove volumes and images |
| `yarn docker:sh`        | Open shell in app container                |

### Useful Docker Commands

```bash
# View only app logs
docker compose logs -f app

# View only nginx logs
docker compose logs -f nginx

# Restart a specific service
docker compose restart app

# Check container health
docker compose ps

# Execute command in running container
docker compose exec app yarn migrate:shards
```

---

## Understanding the Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT REQUESTS                         │
│                   http://localhost:3001                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Port 3001)                       │
│              Load Balancer with IP-Hash                     │
│         (Same user always hits same instance)               │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │   App 1     │ │   App 2     │ │   App 3     │
   │  (Port 4000)│ │  (Port 4000)│ │  (Port 4000)│
   │  + nodemon  │ │  + nodemon  │ │  + nodemon  │
   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
          │               │               │
          └───────────────┼───────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
   ┌─────────────┐                 ┌─────────────┐
   │    Redis    │                 │  PostgreSQL │
   │  (Port 6379)│                 │ (Port 5432) │
   │   Cache     │                 │   Shards:   │
   └─────────────┘                 │  - shard1   │
                                   │  - shard2   │
                                   │  - shard3   │
                                   └─────────────┘
```

### Key Components

| Component  | Port | Purpose                      |
| ---------- | ---- | ---------------------------- |
| Nginx      | 3001 | Load balancer, reverse proxy |
| App (x3)   | 4000 | GraphQL API with nodemon     |
| PostgreSQL | 5432 | Database with 3 shards       |
| Redis      | 6379 | Caching and session storage  |

### Files Overview

| File                       | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `Dockerfile.dev`           | Development image (used by docker-compose) |
| `Dockerfile`               | Production image (multi-stage optimized)   |
| `docker-compose.yml`       | Development services configuration         |
| `docker-compose.prod.yml`  | Production overrides                       |
| `nginx/nginx.conf`         | Nginx load balancer configuration          |
| `.env.docker`              | Environment variables for Docker           |
| `scripts/init-multi-db.sh` | Creates shard databases on first run       |

---

## Scaling the Application

### Scale to 5 Replicas

```bash
yarn docker:dev:scale
```

Or manually:

```bash
docker compose up -d --scale app=5
```

### Scale to Any Number

```bash
docker compose up -d --scale app=10
```

### Verify Scaling

```bash
docker compose ps
```

You should see multiple app containers running.

---

## Production Deployment

### Step 1: Create Production Environment File

Create `.env.docker.prod` with secure values:

```bash
# .env.docker.prod
DATABASE_URL="postgresql://user:SECURE_PASSWORD@postgres:5432/production?schema=public"

SHARD_COUNT=3
SHARD_1_URL="postgresql://user:SECURE_PASSWORD@postgres:5432/shard1?schema=public"
SHARD_2_URL="postgresql://user:SECURE_PASSWORD@postgres:5432/shard2?schema=public"
SHARD_3_URL="postgresql://user:SECURE_PASSWORD@postgres:5432/shard3?schema=public"

REDIS_HOST=redis
REDIS_PORT=6379

PORT=4000
NODE_ENV=production
JWT_SECRET="your-very-secure-jwt-secret-min-32-chars"
MFA_ENCRYPTION_KEY="your-32-character-encryption-key"
```

> ⚠️ **Important:** Never commit `.env.docker.prod` to git. Add it to `.gitignore`.

### Step 2: Build and Deploy

```bash
yarn docker:prod
```

This uses the optimized multi-stage `Dockerfile` which:

- Removes dev dependencies
- Minifies the build
- Creates a smaller image
- Runs as non-root user

### Step 3: Run Migrations in Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app yarn migrate:shards
```

### Step 4: Verify Production Deployment

```bash
# Check all services are running
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Test the endpoint
curl http://localhost:3001/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Production Commands

| Command            | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `yarn docker:prod` | Build and start production containers                                                 |
| Stop production    | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down`                |
| View logs          | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f`             |
| Scale              | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale app=5` |

### Production Best Practices

1. **Use Docker Secrets** for sensitive data instead of environment files
2. **Set up SSL/TLS** - Add HTTPS configuration to Nginx
3. **External Database** - Use managed PostgreSQL (AWS RDS, Cloud SQL, etc.)
4. **External Redis** - Use managed Redis (ElastiCache, Redis Cloud, etc.)
5. **Container Registry** - Push images to Docker Hub, ECR, or GCR
6. **Orchestration** - Consider Kubernetes or Docker Swarm for large deployments
7. **Monitoring** - Add Prometheus, Grafana, or DataDog
8. **Logging** - Use centralized logging (ELK Stack, CloudWatch)

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose logs app

# Rebuild from scratch
yarn docker:clean
yarn docker:dev
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3001

# Kill the process or change the port in docker-compose.yml
```

### Database Connection Issues

```bash
# Check if postgres is healthy
docker compose ps postgres

# View postgres logs
docker compose logs postgres

# Connect to postgres directly
docker compose exec postgres psql -U postgres -d test
```

### esbuild Platform Error

If you see "installed esbuild for another platform":

```bash
# This happens when mixing macOS node_modules with Linux containers
# Solution: Rebuild the image
yarn docker:clean
yarn docker:dev
```

### Reset Everything

```bash
# Stop containers, remove volumes and images
yarn docker:clean

# Start fresh
yarn docker:dev
yarn docker:migrate
```

---

## Environment Variables

| Variable             | Description            | Default         |
| -------------------- | ---------------------- | --------------- |
| `PORT`               | App port               | 4000            |
| `NODE_ENV`           | Environment            | development     |
| `DATABASE_URL`       | Main database          | See .env.docker |
| `SHARD_COUNT`        | Number of shards       | 3               |
| `SHARD_N_URL`        | Shard N connection     | See .env.docker |
| `REDIS_HOST`         | Redis hostname         | redis           |
| `REDIS_PORT`         | Redis port             | 6379            |
| `JWT_SECRET`         | JWT signing key        | Required        |
| `MFA_ENCRYPTION_KEY` | 32-char encryption key | Required        |

---

## Next Steps

- [ ] Set up CI/CD pipeline for automated deployments
- [ ] Configure HTTPS with SSL certificates
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy for databases
- [ ] Implement health check endpoints for container orchestration
