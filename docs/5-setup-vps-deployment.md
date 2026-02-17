# VPS Setup & Deployment Guide

Complete guide for deploying to a fresh Ubuntu VPS with GitHub Actions using SSH key authentication.

## Prerequisites

- Ubuntu 22.04+ VPS (minimum 2GB RAM, 2 vCPU)
- GitHub repository with this code
- SSH key pair for authentication

---

## Quick Setup

### One-Line VPS Setup

SSH into your VPS and run:

```bash
curl -fsSL https://raw.githubusercontent.com/safdar-azeem/graphql-prisma-postgres-ts-boilerplate/main/scripts/setup-vps.sh | bash
```

This will:

1. Prompt for your **project name** (use your GitHub repository name)
2. Install Docker, configure firewall, create `/opt/{project-name}` directory
3. Keep you in the project directory after completion

---

## Dynamic Project Naming

This boilerplate uses **dynamic naming** based on your repository name:

| Repository Name | App Directory     | Container Names                            |
| --------------- | ----------------- | ------------------------------------------ |
| `my-project`    | `/opt/my-project` | `my-project-nginx-1`, `my-project-redis-1` |
| `my-fork`       | `/opt/my-fork`    | `my-fork-nginx-1`, `my-fork-redis-1`       |

**Benefits:**

- ✅ Fork/duplicate without conflicts
- ✅ Multiple projects on same VPS
- ✅ No hardcoded names to change

---

## GitHub Secrets Setup

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

### Required Secrets

| Secret Name    | Description                                |
| -------------- | ------------------------------------------ |
| `VPS_HOST`     | Your VPS IP address (e.g., `123.45.67.89`) |
| `VPS_USERNAME` | SSH username (usually `root`)              |
| `VPS_SSH_KEY`  | Private SSH key (see below)                |
| `GH_SECRET`    | GitHub Personal Access Token               |

### Generate SSH Key

On your **local machine**:

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions

# Copy public key to VPS
ssh-copy-id -i ~/.ssh/github_actions.pub root@YOUR_VPS_IP

# Display private key (copy this to VPS_SSH_KEY secret)
cat ~/.ssh/github_actions
```

### Generate GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Copy token to `GH_SECRET` secret

---

## Configure Environment

### Create .env on VPS

```bash
cd /opt/{your-project-name}
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:your-secure-password@postgres:5432/production?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=production
SHARD_COUNT=3
SHARD_1_URL=postgresql://postgres:your-secure-password@postgres:5432/shard1?schema=public
SHARD_2_URL=postgresql://postgres:your-secure-password@postgres:5432/shard2?schema=public
SHARD_3_URL=postgresql://postgres:your-secure-password@postgres:5432/shard3?schema=public
REDIS_HOST=redis
REDIS_PORT=6379
PORT=3001
SSL_PORT=443
NODE_ENV=production
APP_REPLICAS=3
JWT_SECRET=generate-with-openssl-rand-base64-32
MFA_ENCRYPTION_KEY=exactly-32-characters-here-now!
EOF
```

**Generate secure values:**

```bash
# JWT_SECRET
openssl rand -base64 32

# MFA_ENCRYPTION_KEY (exactly 32 chars)
openssl rand -base64 24
```

---

## Deployment

### Automatic (Recommended)

Push to `main` branch → GitHub Actions auto-deploys with blue-green strategy

### Manual Deployment

```bash
cd /opt/{your-project-name}
./scripts/deploy.sh
```

### Verify

```bash
# Check health
curl http://localhost:3001/health

# View running containers
docker ps --filter "name={your-project-name}"
```

---

## Monitoring & Management

```bash
# View logs (all services)
docker compose -f docker-compose.prod.yml logs -f

# View app logs only
docker compose -f docker-compose.prod.yml logs -f app

# Scale to 5 replicas
docker compose -f docker-compose.prod.yml up -d --scale app=5

# Restart all services
docker compose -f docker-compose.prod.yml restart
```

---

## Database Backup

```bash
# Backup all databases
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dumpall -U postgres > backups/backup-$(date +%Y%m%d).sql

# Restore from backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres < backups/backup-20240101.sql
```

---

## Multiple Projects on Same VPS

You can run multiple projects on the same VPS. Each project needs:

1. **Different PORT** in `.env`:
   - Project A: `PORT=3001`, `SSL_PORT=443`
   - Project B: `PORT=4000`, `SSL_PORT=4443`

2. **Different repository name** → Different container names (automatic)

Example:

```bash
docker ps
# graphql-prisma-postgres-ts-boilerplate-nginx-1  0.0.0.0:3001->80/tcp
# graphql-prisma-postgres-ts-boilerplate-app-1
# vps-erp-api-nginx-1                             0.0.0.0:4000->80/tcp
# vps-erp-api-app-1
```

---

## Troubleshooting

| Issue                   | Solution                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| SSH connection fails    | Verify `VPS_SSH_KEY` format (must include full key with headers) |
| Port already in use     | Change `PORT` or `SSL_PORT` in `.env`                            |
| Container name conflict | Old containers exist - run `docker rm -f {container-name}`       |
| GitHub Actions timeout  | Increase `command_timeout` in deploy.yml                         |

### Reset Everything

```bash
cd /opt/{your-project-name}
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec app yarn db:update
```

---

## Security Checklist

- [x] Use SSH keys (not passwords)
- [x] Firewall configured (ufw)
- [x] fail2ban enabled
- [ ] Set strong database passwords in `.env`
- [ ] Enable SSL/TLS certificates
- [ ] Regular security updates (`apt update && apt upgrade`)
- [ ] Regular database backups
