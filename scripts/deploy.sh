#!/bin/bash
# =============================================================================
# Blue-Green Deployment Script
# =============================================================================

set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
APP_DIR="${APP_DIR:-/opt/app}"

cd "$APP_DIR"

echo "==========================================="
echo "🔵 Starting Blue-Green Deployment"
echo "==========================================="

# Pull latest images
echo "📥 Pulling latest images..."
docker compose -f $COMPOSE_FILE pull

# Get current container count
CURRENT_COUNT=$(docker compose -f $COMPOSE_FILE ps app --quiet 2>/dev/null | wc -l || echo "0")
echo "Current app instances: $CURRENT_COUNT"

# Scale up (double the instances temporarily)
TARGET_COUNT=$((CURRENT_COUNT > 0 ? CURRENT_COUNT * 2 : 6))
echo "🟢 Scaling up to $TARGET_COUNT instances (green deployment)..."
docker compose -f $COMPOSE_FILE up -d --scale app=$TARGET_COUNT --no-recreate

# Wait for new instances to be healthy
echo "⏳ Waiting for new instances to be healthy..."
sleep 20

# Health check
echo "🔍 Running health checks..."
for i in {1..5}; do
    if curl -sf http://localhost:3001/health > /dev/null; then
        echo "✅ Health check passed!"
        break
    fi
    echo "Attempt $i failed, retrying..."
    sleep 5
done

# Run migrations
echo "📊 Running database migrations..."
docker compose -f $COMPOSE_FILE exec -T app yarn migrate:shards || echo "Migration skipped or already up to date"

# Replace old containers with new ones
FINAL_COUNT=$((CURRENT_COUNT > 0 ? CURRENT_COUNT : 3))
echo "🔄 Rolling update to $FINAL_COUNT instances..."
docker compose -f $COMPOSE_FILE up -d --force-recreate --scale app=$FINAL_COUNT

# Cleanup
echo "🧹 Cleaning up..."
docker image prune -f

# Final health check
sleep 10
if curl -sf http://localhost:3001/health > /dev/null; then
    echo ""
    echo "==========================================="
    echo "✅ Deployment Successful!"
    echo "==========================================="
else
    echo ""
    echo "==========================================="
    echo "⚠️  Warning: Health check failed after deployment"
    echo "==========================================="
    exit 1
fi
