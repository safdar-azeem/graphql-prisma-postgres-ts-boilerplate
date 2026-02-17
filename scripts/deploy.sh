#!/bin/bash
# =============================================================================
# Blue-Green Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh
#
# Environment Variables:
#   PROJECT_NAME  - Project identifier (defaults to current directory name)
#   APP_DIR       - Application directory (defaults to /opt/$PROJECT_NAME)
#   COMPOSE_FILE  - Docker compose file (defaults to docker-compose.prod.yml)
#   APP_REPLICAS  - Number of app replicas (defaults to 3)
#   PORT          - Health check port (defaults to 3001)
# =============================================================================

set -e

# Dynamic project naming - uses current directory name if PROJECT_NAME not set
if [ -z "$PROJECT_NAME" ]; then
    # Get the repository/project name from git or current directory
    if [ -d ".git" ]; then
        PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null)
    fi
    PROJECT_NAME=${PROJECT_NAME:-$(basename "$(pwd)")}
fi

# Sanitize project name for Docker (lowercase, alphanumeric and hyphens only)
PROJECT_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_DIR="${APP_DIR:-/opt/$PROJECT_NAME}"
PORT="${PORT:-3001}"

cd "$APP_DIR"

echo "==========================================="
echo "🔵 Starting Blue-Green Deployment"
echo "   Project: $PROJECT_NAME"
echo "   Directory: $APP_DIR"
echo "==========================================="

# Pull latest images
echo "📥 Pulling latest images..."
docker compose -f $COMPOSE_FILE pull

# Get desired replica count from env or default to 3
REPLICAS=${APP_REPLICAS:-3}

# Scale up (double the instances temporarily or at least +3 for zero downtime)
# We want at least as many new containers as the final target
TARGET_COUNT=$((REPLICAS * 2))
echo "🟢 Scaling up to $TARGET_COUNT instances (green deployment, targeting $REPLICAS final)..."
docker compose -f $COMPOSE_FILE up -d --scale app=$TARGET_COUNT --no-recreate

# Wait for new instances to be healthy
echo "⏳ Waiting for new instances to be healthy..."
sleep 20

# Health check
echo "🔍 Running health checks..."
for i in {1..5}; do
    if curl -sf http://localhost:$PORT/health > /dev/null; then
        echo "✅ Health check passed!"
        break
    fi
    echo "Attempt $i failed, retrying..."
    sleep 5
done

# Run migrations on all shards
echo "📊 Running database migrations..."
docker compose -f $COMPOSE_FILE exec -T app yarn db:udpate || echo "Migration skipped or already up to date"

# Replace old containers with new ones (scale down to desired count)
echo "🔄 Rolling update to $REPLICAS instances..."
docker compose -f $COMPOSE_FILE up -d --force-recreate --scale app=$REPLICAS

# Reload Nginx to ensure it picks up the new IP addresses if needed
# (Docker internal DNS usually handles this, but a reload forces a DNS refresh in Nginx)
if docker compose -f $COMPOSE_FILE ps nginx >/dev/null 2>&1; then
    echo "🔄 Reloading Nginx configuration..."
    docker compose -f $COMPOSE_FILE exec -T nginx nginx -s reload
fi

# Cleanup
echo "🧹 Cleaning up..."
docker image prune -f

# Final health check
sleep 10
if curl -sf http://localhost:$PORT/health > /dev/null; then
    echo ""
    echo "==========================================="
    echo "✅ Deployment Successful!"
    echo "   Project: $PROJECT_NAME"
    echo "   Containers: $(docker ps --filter "name=$PROJECT_NAME" --format '{{.Names}}' | tr '\n' ' ')"
    echo "==========================================="
else
    echo ""
    echo "==========================================="
    echo "⚠️  Warning: Health check failed after deployment"
    echo "==========================================="
    exit 1
fi