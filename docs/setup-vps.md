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

### Step 1: Update .env on VPS

The `.env` file is committed with safe defaults. For production, update these values:

```bash
cd /opt/app
nano .env
```

**Change these values:**

```env
# Change passwords
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
DATABASE_URL="postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/production?schema=public"
SHARD_1_URL="postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/shard1?schema=public"
SHARD_2_URL="postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/shard2?schema=public"
SHARD_3_URL="postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/shard3?schema=public"

# Change secrets (generate with: openssl rand -base64 32)
JWT_SECRET=YOUR_RANDOM_SECRET
MFA_ENCRYPTION_KEY=YOUR_32_CHARACTER_KEY
```

## GitHub Secrets

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name    | Value               |
| -------------- | ------------------- |
| `VPS_HOST`     | Your VPS IP address |
| `VPS_USERNAME` | `root`              |
| `VPS_PASSWORD` | Your SSH password   |

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
