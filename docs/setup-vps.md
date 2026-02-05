# VPS Setup & Deployment Guide

Complete guide for deploying to a fresh Ubuntu VPS with GitHub Actions.

## Prerequisites

- Ubuntu 22.04+ VPS (minimum 2GB RAM, 2 vCPU)
- GitHub repository with this code

## VPS Initial Setup

### Step 1: SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Run Setup Script

```bash
curl -fsSL https://raw.githubusercontent.com/safdar-azeem/graphql-prisma-postgres-ts-boilerplate/main/scripts/setup-vps.sh | bash
```

### Step 3: Verify Docker

```bash
docker --version
docker compose version
```

## Configure Environment

### Step 1: Create .env on VPS

> **⚠️ Important:** The `.env` file must NOT contain quotes around values or comments. Docker Compose will not parse them correctly.

Create the `.env` file on your VPS:

```bash
cd /opt/app
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:password@postgres:5432/production?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=production
SHARD_COUNT=3
SHARD_1_URL=postgresql://postgres:password@postgres:5432/shard1?schema=public
SHARD_2_URL=postgresql://postgres:password@postgres:5432/shard2?schema=public
SHARD_3_URL=postgresql://postgres:password@postgres:5432/shard3?schema=public
SHARD_POOL_SIZE=10
SHARD_IDLE_TIMEOUT_MS=10000
SHARD_CONNECTION_TIMEOUT_MS=5000
SHARD_HEALTH_CHECK_INTERVAL_MS=30000
SHARD_CIRCUIT_BREAKER_THRESHOLD=3
SHARD_ROUTING_STRATEGY=modulo
REDIS_HOST=redis
REDIS_PORT=6379
PORT=4000
NODE_ENV=production
JWT_SECRET=change-this-to-a-secure-secret-in-production
MFA_ENCRYPTION_KEY=A9f3K2mQ7Xc8RZL4pWJ6N0H5sD1EYTUb
EOF
```

**Replace these values:**

- `YOUR_SECURE_PASSWORD` - Strong database password
- `YOUR_RANDOM_SECRET` - Generate with: `openssl rand -base64 32`
- `YOUR_32_CHARACTER_KEY` - Must be exactly 32 characters

## GitHub Secrets

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name          | Value                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `VPS_HOST`           | Your VPS IP address                                                          |
| `VPS_USERNAME`       | `root`                                                                       |
| `VPS_PASSWORD`       | Your SSH password                                                            |
| `DATABASE_URL`       | `postgresql://postgres:YOUR_PASSWORD@postgres:5432/production?schema=public` |
| `POSTGRES_USER`      | `postgres`                                                                   |
| `POSTGRES_PASSWORD`  | Your secure database password                                                |
| `POSTGRES_DB`        | `production`                                                                 |
| `SHARD_1_URL`        | `postgresql://postgres:YOUR_PASSWORD@postgres:5432/shard1?schema=public`     |
| `SHARD_2_URL`        | `postgresql://postgres:YOUR_PASSWORD@postgres:5432/shard2?schema=public`     |
| `SHARD_3_URL`        | `postgresql://postgres:YOUR_PASSWORD@postgres:5432/shard3?schema=public`     |
| `JWT_SECRET`         | Generate with: `openssl rand -base64 32`                                     |
| `MFA_ENCRYPTION_KEY` | Exactly 32 characters                                                        |

> **Note:** Replace `YOUR_PASSWORD` with your `POSTGRES_PASSWORD` value in all database URLs.

## Deployment

### Automatic (Recommended)

Push to `main` branch → GitHub Actions auto-deploys

### Manual

```bash
cd /opt/app
git pull origin main
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec app yarn migrate:shards
```

### Verify

```bash
curl http://localhost:3001/health
```

## Monitoring

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View app logs only
docker compose -f docker-compose.prod.yml logs -f app

# Scale to 5 replicas
docker compose -f docker-compose.prod.yml up -d --scale app=5

# Restart
docker compose -f docker-compose.prod.yml restart
```

## Database Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dumpall -U postgres > /opt/app/backups/backup-$(date +%Y%m%d).sql
```

## Commands Reference

| Command                                                                  | Description           |
| ------------------------------------------------------------------------ | --------------------- |
| `docker compose -f docker-compose.prod.yml up -d`                        | Start services        |
| `docker compose -f docker-compose.prod.yml down`                         | Stop services         |
| `docker compose -f docker-compose.prod.yml logs -f`                      | View logs             |
| `docker compose -f docker-compose.prod.yml exec app yarn migrate:shards` | Run migrations        |
| `./scripts/deploy.sh`                                                    | Blue-green deployment |

## Troubleshooting

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs app

# Reset everything
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec app yarn migrate:shards
```

## Security Checklist

- [ ] Change default SSH port
- [ ] Use SSH keys instead of password
- [ ] Set strong database passwords in `.env`
- [ ] Enable SSL/TLS certificates
- [ ] Configure fail2ban
- [ ] Regular security updates
- [ ] Regular database backups
