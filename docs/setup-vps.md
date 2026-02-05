# VPS Setup & Deployment Guide

## Complete guide for deploying this application to a fresh Ubuntu VPS with Docker and GitHub Actions.

## Prerequisites

- Ubuntu 22.04+ VPS (minimum 2GB RAM, 2 vCPU)
- Domain name (optional, for SSL)
- GitHub repository with this code

---

## VPS Initial Setup

### Step 1: SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Run Setup Script

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/safdar-azeem/graphql-prisma-postgres-ts-boilerplate/refs/heads/main/scripts/setup-vps.sh | bash
```

### Step 3: Verify Docker

```bash
docker --version
docker compose version
```

---

## Configure Environment

### Step 1: Create Production Environment File

```bash
nano /opt/app/.env.production
```

Add the following (replace with your values):

```env
# ==========================================
# POSTGRES CONFIGURATION
# ==========================================
# Define the password here. Docker sends this to the container.
POSTGRES_USER=postgres
POSTGRES_PASSWORD=my_secure_password_123!
POSTGRES_DB=production

# ==========================================
# APP DATABASE CONNECTION
# ==========================================
# Must use 'postgres' host (container name) and the password from above
DATABASE_URL="postgresql://postgres:my_secure_password_123!@postgres:5432/production?schema=public"

# ==========================================
# REDIS
# ==========================================
# Must use 'redis' host (container name)
REDIS_HOST=redis
REDIS_PORT=6379

# ==========================================
# SHARDING (App -> Postgres)
# ==========================================
SHARD_COUNT=3
# Note: In a single-DB setup, these all point to the same DB but could be separate in future
SHARD_1_URL="postgresql://postgres:my_secure_password_123!@postgres:5432/shard1?schema=public"
SHARD_2_URL="postgresql://postgres:my_secure_password_123!@postgres:5432/shard2?schema=public"
SHARD_3_URL="postgresql://postgres:my_secure_password_123!@postgres:5432/shard3?schema=public"

# ==========================================
# APPLICATION SETTINGS
# ==========================================
PORT=4000
NODE_ENV=production
JWT_SECRET=generate_a_random_jwt_secret_string
MFA_ENCRYPTION_KEY=A9f3K2mQ7Xc8RZL4pWJ6N0H5sD1EYTUb

# ==========================================
# POOLING
# ==========================================
SHARD_POOL_SIZE=10
SHARD_IDLE_TIMEOUT_MS=10000
SHARD_CONNECTION_TIMEOUT_MS=5000
SHARD_HEALTH_CHECK_INTERVAL_MS=30000
SHARD_CIRCUIT_BREAKER_THRESHOLD=3
SHARD_ROUTING_STRATEGY=modulo
```

### Step 2: Generate Secure Secrets

```bash
# Generate random JWT secret
openssl rand -base64 32

# Generate random encryption key
openssl rand -base64 24
```

---

## GitHub Secrets

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name    | Value                         |
| -------------- | ----------------------------- |
| `VPS_HOST`     | `72.60.194.185` (your VPS IP) |
| `VPS_USERNAME` | `root`                        |
| `VPS_PASSWORD` | `your-ssh-password`           |

---

## First Deployment

### Option 1: Automatic (GitHub Actions)

1. Push code to `main` branch
2. GitHub Actions will automatically deploy

### Option 2: Manual

```bash
cd /opt/app

# Pull latest code
git pull origin main

# Start services
docker compose -f docker-compose.vps.yml up -d

# Run migrations
docker compose -f docker-compose.vps.yml exec app yarn migrate:shards

# Check status
docker compose -f docker-compose.vps.yml ps
```

### Verify Deployment

```bash
# Health check
curl http://localhost:3001/health

# Test GraphQL
curl http://localhost:3001/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All logs
docker compose -f docker-compose.vps.yml logs -f

# App logs only
docker compose -f docker-compose.vps.yml logs -f app

# Nginx logs
docker compose -f docker-compose.vps.yml logs -f nginx
```

### Scale Application

```bash
# Scale to 5 replicas
docker compose -f docker-compose.vps.yml up -d --scale app=5
```

### Restart Services

```bash
docker compose -f docker-compose.vps.yml restart
```

### Database Backup

```bash
# Backup all databases
docker compose -f docker-compose.vps.yml exec postgres \
  pg_dumpall -U postgres > /opt/app/backups/backup-$(date +%Y%m%d).sql
```

### Update Deployment

```bash
cd /opt/app
git pull origin main
./scripts/deploy.sh
```

---

## Commands Reference

| Command                                                                 | Description             |
| ----------------------------------------------------------------------- | ----------------------- |
| `docker compose -f docker-compose.vps.yml up -d`                        | Start all services      |
| `docker compose -f docker-compose.vps.yml down`                         | Stop all services       |
| `docker compose -f docker-compose.vps.yml ps`                           | Show running containers |
| `docker compose -f docker-compose.vps.yml logs -f`                      | View logs               |
| `docker compose -f docker-compose.vps.yml exec app yarn migrate:shards` | Run migrations          |
| `./scripts/deploy.sh`                                                   | Blue-green deployment   |

---

## Troubleshooting

### Container Won't Start

```bash
docker compose -f docker-compose.vps.yml logs app
```

### Database Connection Issues

```bash
docker compose -f docker-compose.vps.yml exec postgres psql -U postgres -c "\l"
```

### Reset Everything

```bash
docker compose -f docker-compose.vps.yml down -v
docker compose -f docker-compose.vps.yml up -d
docker compose -f docker-compose.vps.yml exec app yarn migrate:shards
```

---

## Security Checklist

- [ ] Change default SSH port
- [ ] Use SSH keys instead of password
- [ ] Set strong database passwords
- [ ] Enable SSL/TLS certificates
- [ ] Configure fail2ban
- [ ] Regular security updates (`apt update && apt upgrade`)
- [ ] Regular database backups
