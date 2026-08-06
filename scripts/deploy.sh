#!/bin/bash
# =============================================================================
# Blue-Green Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh
#
# Environment Variables:
#   PROJECT_NAME           - Project identifier (defaults to directory name)
#   APP_DIR                - Application directory (defaults to /opt/$PROJECT_NAME)
#   COMPOSE_FILE           - Docker compose file (defaults to docker-compose.prod.yml)
#   APP_REPLICAS           - Number of app replicas (defaults to 3)
#   PORT                   - Health check port (defaults to 3001)
#   DOCKER_IMAGE           - Application container image
#   DOCKER_IMAGE_MIGRATOR  - Matching migrator container image
# =============================================================================

set -e

# Dynamic project naming - uses current directory name if PROJECT_NAME not set
if [ -z "$PROJECT_NAME" ]; then
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

# Source .env file if available
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

PG_USER="${POSTGRES_USER:-postgres}"

echo "==========================================="
echo "🔵 Starting Blue-Green Deployment"
echo "   Project: $PROJECT_NAME"
echo "   Directory: $APP_DIR"
echo "==========================================="

# 1. Pull latest matching images
echo "📥 Pulling latest images..."
docker compose -f "$COMPOSE_FILE" pull

# 2. Ensure database & redis services are running (required for fresh server or clean setup)
echo "🐘 Ensuring PostgreSQL and Redis services are running..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

# 3. Wait for PostgreSQL readiness using configured user
echo "⏳ Waiting for PostgreSQL readiness (user: $PG_USER)..."
DB_READY=false
for i in {1..12}; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        DB_READY=true
        break
    fi
    echo "  Waiting for PostgreSQL... (attempt $i/12)"
    sleep 5
done

if [ "$DB_READY" != "true" ]; then
    echo "❌ Error: PostgreSQL did not become ready within 60 seconds."
    exit 1
fi

# 4. Run database migrations on all shards BEFORE starting or scaling new application instances
echo "📊 Running database migrations across all shards using dedicated migrator image..."
docker compose -f "$COMPOSE_FILE" run --rm migrator yarn db:update

# 5. Capture existing running app containers
OLD_CONTAINER_IDS=$(docker compose -f "$COMPOSE_FILE" ps -q app 2>/dev/null || true)

REPLICAS=${APP_REPLICAS:-3}
TARGET_COUNT=$((REPLICAS * 2))

# 6. Scale up green containers alongside blue
echo "🟢 Scaling up release containers to $TARGET_COUNT instances (target: $REPLICAS)..."
docker compose -f "$COMPOSE_FILE" up -d --scale app=$TARGET_COUNT --no-recreate

# 7. Identify newly created container IDs
ALL_CONTAINER_IDS=$(docker compose -f "$COMPOSE_FILE" ps -q app)
NEW_CONTAINER_IDS=""
for id in $ALL_CONTAINER_IDS; do
    if ! echo "$OLD_CONTAINER_IDS" | grep -q "$id"; then
        NEW_CONTAINER_IDS="$NEW_CONTAINER_IDS $id"
    fi
done

# If all containers are new (fresh deploy), validate all of them
if [ -z "$NEW_CONTAINER_IDS" ]; then
    NEW_CONTAINER_IDS="$ALL_CONTAINER_IDS"
fi

# 8. Health check: Inspect each new container directly (not through shared load balancer)
echo "🔍 Validating health status of new release containers directly..."
ALL_NEW_HEALTHY=true

for container_id in $NEW_CONTAINER_IDS; do
    echo "  Checking container $container_id..."
    CONTAINER_OK=false
    for attempt in {1..12}; do
        STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo "unknown")
        if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "running" ]; then
            echo "    ✅ Container $container_id is $STATUS!"
            CONTAINER_OK=true
            break
        elif [ "$STATUS" = "unhealthy" ]; then
            echo "    ❌ Container $container_id reported unhealthy!"
            break
        fi
        echo "    Waiting for container $container_id (status: $STATUS, attempt $attempt/12)..."
        sleep 5
    done

    if [ "$CONTAINER_OK" != "true" ]; then
        ALL_NEW_HEALTHY=false
        break
    fi
done

if [ "$ALL_NEW_HEALTHY" != "true" ]; then
    echo "❌ Error: One or more new release containers failed health checks!"
    echo "   Aborting replacement. Cleaning up failed new containers and preserving existing release..."
    for container_id in $NEW_CONTAINER_IDS; do
        docker rm -f "$container_id" 2>/dev/null || true
    done
    exit 1
fi

# 9. Rolling update: complete rollout to target replica count
echo "🔄 Rolling update to $REPLICAS instances..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --scale app=$REPLICAS

# 10. Reload Nginx configuration
if docker compose -f "$COMPOSE_FILE" ps nginx >/dev/null 2>&1; then
    echo "🔄 Reloading Nginx configuration..."
    docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload || true
fi

# 11. Final public health check
sleep 5
if curl -sf http://localhost:$PORT/health > /dev/null; then
    echo ""
    echo "==========================================="
    echo "✅ Deployment Successful!"
    echo "   Project: $PROJECT_NAME"
    echo "   Containers: $(docker ps --filter "name=$PROJECT_NAME" --format '{{.Names}}' | tr '\n' ' ')"
    echo "==========================================="
else
    echo "⚠️ Warning: Public health endpoint returned error after container replacement"
    exit 1
fi