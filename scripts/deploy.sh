#!/bin/bash
# =============================================================================
# Blue-Green Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh
#
# This script is the single canonical entry point for production deployment.
# It is called by GitHub Actions after building and pushing immutable Docker
# images for the application and migrator.
#
# Environment Variables (set by CI or .env):
#   PROJECT_NAME           - Project identifier (defaults to directory name)
#   APP_DIR                - Application directory (defaults to /opt/$PROJECT_NAME)
#   COMPOSE_FILE           - Docker compose file (defaults to docker-compose.prod.yml)
#   APP_REPLICAS           - Number of app replicas per release group (defaults to 3)
#   PORT                   - Public Nginx port (defaults to 3001)
#   DOCKER_IMAGE           - Immutable application image (required, must have SHA tag)
#   DOCKER_IMAGE_MIGRATOR  - Matching immutable migrator image (required, must have SHA tag)
#   COMMIT_SHA             - Git commit SHA for release verification
#   DRAIN_SECONDS          - Seconds to wait for connections to drain (defaults to 15)
#
# Execution Flow:
#   1.  Acquire deployment lock (flock)
#   2.  Validate configuration & recovery marker
#   3.  Validate strict immutable SHA tags on images
#   4.  Pull immutable images
#   5.  Start missing shared dependencies without recreation (postgres, redis)
#   6.  Wait for PostgreSQL readiness
#   7.  Phase A: Determine & validate active release BEFORE database migrations
#   8.  Run database migrations via dedicated migrator container
#   9.  Phase B: Revalidate active release & commit SHA AFTER database migrations
#   10. Clean stale candidate, start fresh with --force-recreate + --scale
#   11. Validate every candidate container reaches "healthy" + enforce count
#   12. Switch Nginx upstream in-place, start if missing, reload existing daemon
#   13. Validate through public route (strict SHA + group matching)
#   14. Roll back if public validation fails (creates recovery marker if unverified)
#   15. Retire old release group with connection draining
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration — Phase 1: Immutable CI variables
# =============================================================================
# Preserve CI-provided image variables before loading .env.
# These MUST NOT be overwritten by .env.

CI_DOCKER_IMAGE="${DOCKER_IMAGE:-}"
CI_DOCKER_IMAGE_MIGRATOR="${DOCKER_IMAGE_MIGRATOR:-}"
CI_COMMIT_SHA="${COMMIT_SHA:-}"

# =============================================================================
# Configuration — Phase 2: Project identity (needed before .env for paths)
# =============================================================================

if [ -z "${PROJECT_NAME:-}" ]; then
    PROJECT_NAME=$(basename "$(pwd)")
fi

# Sanitize project name for Docker (lowercase, alphanumeric and hyphens only)
PROJECT_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_DIR="${APP_DIR:-/opt/$PROJECT_NAME}"

# =============================================================================
# Configuration — Phase 3: Load .env
# =============================================================================

if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
fi

if [ -f ".env" ]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
fi

# =============================================================================
# Configuration — Phase 4: Restore CI immutables, then derive remaining config
# =============================================================================

if [ -n "$CI_DOCKER_IMAGE" ]; then
    DOCKER_IMAGE="$CI_DOCKER_IMAGE"
fi
if [ -n "$CI_DOCKER_IMAGE_MIGRATOR" ]; then
    DOCKER_IMAGE_MIGRATOR="$CI_DOCKER_IMAGE_MIGRATOR"
fi
if [ -n "$CI_COMMIT_SHA" ]; then
    COMMIT_SHA="$CI_COMMIT_SHA"
fi

PORT="${PORT:-3001}"
REPLICAS="${APP_REPLICAS:-3}"
DRAIN_SECONDS="${DRAIN_SECONDS:-15}"
LOCK_FILE="/tmp/${PROJECT_NAME}-deploy.lock"
STATE_FILE="${APP_DIR}/.active-release"
RECOVERY_MARKER="${APP_DIR}/.deployment-recovery-required"
UPSTREAM_FILE="${APP_DIR}/nginx/active-upstream.conf"
UPSTREAM_DIR="${APP_DIR}/nginx"
PG_USER="${POSTGRES_USER:-postgres}"

# =============================================================================
# Logging — All diagnostic logs are sent to STDERR to prevent stdout contamination
# =============================================================================

log()   { echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO]  $*" >&2; }
warn()  { echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN]  $*" >&2; }
error() { echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $*" >&2; }
fatal() { error "$@"; exit 1; }

# =============================================================================
# Step 1: Acquire Deployment Lock (BEFORE any state reading or mutation)
# =============================================================================

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    fatal "Another deployment is already running (lock: $LOCK_FILE). Aborting."
fi
# Lock acquired — held until this process exits.

log "==========================================="
log "🔵 Starting Blue-Green Deployment"
log "   Project:    $PROJECT_NAME"
log "   Directory:  $APP_DIR"
log "   Compose:    $COMPOSE_FILE"
log "   Replicas:   $REPLICAS"
log "   Drain Sec:  $DRAIN_SECONDS"
log "==========================================="

# =============================================================================
# Step 2: Validate Deployment Configuration Values & Recovery Marker
# =============================================================================

if [ -f "$RECOVERY_MARKER" ]; then
    error "🚨 RECOVERY MARKER FOUND: $RECOVERY_MARKER"
    error "🚨 Previous deployment suffered an unverified rollback!"
    error "🚨 Automatic deployment is blocked. Manual reconciliation is required before deploying."
    fatal "Deployment blocked by recovery marker ($RECOVERY_MARKER)."
fi

if [ -z "$PROJECT_NAME" ]; then
    fatal "Sanitized PROJECT_NAME is empty."
fi
if [ ! -d "$APP_DIR" ]; then
    fatal "Application directory '$APP_DIR' does not exist."
fi
if [ ! -f "$COMPOSE_FILE" ]; then
    fatal "Compose file '$COMPOSE_FILE' does not exist in $APP_DIR."
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    fatal "Invalid PORT: '$PORT'. Must be a valid port number between 1 and 65535."
fi
if ! [[ "$REPLICAS" =~ ^[0-9]+$ ]] || [ "$REPLICAS" -lt 1 ]; then
    fatal "Invalid APP_REPLICAS: '$REPLICAS'. Must be a positive integer (>= 1)."
fi
if ! [[ "$DRAIN_SECONDS" =~ ^[0-9]+$ ]] || [ "$DRAIN_SECONDS" -lt 0 ]; then
    fatal "Invalid DRAIN_SECONDS: '$DRAIN_SECONDS'. Must be a non-negative integer (>= 0)."
fi

# =============================================================================
# Rollback Function
# =============================================================================

CANDIDATE_STARTED=false
NGINX_SWITCHED=false
CANDIDATE_SERVICE=""
ACTIVE="none"
CANDIDATE=""
ROLLBACK_VERIFIED=false

rollback() {
    local exit_code=${1:-1}
    local reason="${2:-Unexpected error}"

    # Disable trap during rollback to prevent recursion
    trap - ERR

    error "🔄 ROLLBACK INITIATED: $reason"

    if [ "${ACTIVE:-none}" = "none" ]; then
        log "⚠️  Rollback during first deployment: cleaning Nginx and candidate resources..."

        # Stop and remove Nginx so no 502 listener is left behind
        docker compose -f "$COMPOSE_FILE" stop nginx 2>/dev/null || true
        docker compose -f "$COMPOSE_FILE" rm -f nginx 2>/dev/null || true

        # Clean active config and state files
        rm -f "$UPSTREAM_FILE" "$STATE_FILE" "$RECOVERY_MARKER" 2>/dev/null || true

        # Clean candidate containers
        if [ -n "${CANDIDATE_SERVICE:-}" ]; then
            log "🧹 Removing candidate containers ($CANDIDATE_SERVICE)..."
            docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" stop "$CANDIDATE_SERVICE" 2>/dev/null || true
            docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" rm -f "$CANDIDATE_SERVICE" 2>/dev/null || true
        fi

        log "❌ First deployment failed and was cleaned up completely."
        exit "$exit_code"
    fi

    # Rollback when an active release exists
    if [ "$NGINX_SWITCHED" = "true" ]; then
        log "🔄 Restoring Nginx upstream to $ACTIVE..."
        if [ -f "${UPSTREAM_DIR}/upstream-${ACTIVE}.conf" ]; then
            cat "${UPSTREAM_DIR}/upstream-${ACTIVE}.conf" > "$UPSTREAM_FILE"
        fi

        # Reload Nginx with restored upstream
        docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -t 2>/dev/null && \
            docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload 2>/dev/null || true

        # Verify rollback by checking the old release identity
        sleep 3
        ROLLBACK_VERIFIED=false
        for attempt in $(seq 1 5); do
            local rb_response
            rb_response=$(curl -sf "http://localhost:${PORT}/health/ready" 2>/dev/null || echo "")
            if [ -n "$rb_response" ]; then
                local rb_group
                rb_group=$(echo "$rb_response" | grep -o '"releaseGroup":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
                if [ "$rb_group" = "$ACTIVE" ]; then
                    ROLLBACK_VERIFIED=true
                    break
                fi
            fi
            sleep 2
        done

        if [ "$ROLLBACK_VERIFIED" = "true" ]; then
            log "✅ Rollback verified — $ACTIVE is serving traffic (releaseGroup confirmed)."
        else
            error "🚨 CRITICAL: Rollback to $ACTIVE could not be verified via public endpoint!"
            error "🚨 Creating recovery marker ($RECOVERY_MARKER). Candidate containers will NOT be removed."
            error "🚨 MANUAL INTERVENTION REQUIRED IMMEDIATELY."

            cat <<EOF > "$RECOVERY_MARKER"
UNVERIFIED_ROLLBACK_DETECTED
timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
active_release="$ACTIVE"
active_commit_sha="${PREVIOUS_ACTIVE_SHA:-unknown}"
candidate_release="$CANDIDATE"
candidate_service="${CANDIDATE_SERVICE:-unknown}"
candidate_commit_sha="${COMMIT_SHA:-unknown}"
reason="$reason"
EOF
        fi
    fi

    # Candidate container cleanup:
    # Only remove candidate containers if rollback was verified OR if Nginx traffic was never switched to candidate.
    # If Nginx traffic was switched and rollback verification failed, preserve candidate containers so Nginx is not left pointing to stopped containers.
    if [ -n "${CANDIDATE_SERVICE:-}" ]; then
        if [ "$NGINX_SWITCHED" = "false" ] || [ "$ROLLBACK_VERIFIED" = "true" ]; then
            log "🧹 Removing candidate containers ($CANDIDATE_SERVICE)..."
            docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" stop "$CANDIDATE_SERVICE" 2>/dev/null || true
            docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" rm -f "$CANDIDATE_SERVICE" 2>/dev/null || true
        else
            error "⚠️  Preserved candidate containers ($CANDIDATE_SERVICE) alongside active ($ACTIVE) due to unverified rollback."
        fi
    fi

    if [ "$ROLLBACK_VERIFIED" = "true" ] || [ "$NGINX_SWITCHED" = "false" ]; then
        log "🔵 Active release ($ACTIVE) preserved."
    fi

    exit "$exit_code"
}

# =============================================================================
# Step 3: Validate Strict Immutable SHA Image Tags
# =============================================================================

if [ -z "${DOCKER_IMAGE:-}" ]; then
    fatal "DOCKER_IMAGE is not set. Cannot deploy without an application image."
fi

if [ -z "${DOCKER_IMAGE_MIGRATOR:-}" ]; then
    fatal "DOCKER_IMAGE_MIGRATOR is not set. Cannot deploy without a migrator image."
fi

# Extract SHA tag from image strings (must be a valid git commit SHA, 7 to 40 hex chars)
APP_SHA=$(echo "$DOCKER_IMAGE" | grep -oE ':[a-f0-9]{7,40}$' | tr -d ':' || true)
MIGRATOR_SHA=$(echo "$DOCKER_IMAGE_MIGRATOR" | grep -oE ':migrator-[a-f0-9]{7,40}$|:[a-f0-9]{7,40}$' | grep -oE '[a-f0-9]{7,40}$' || true)

if [ -z "$APP_SHA" ]; then
    fatal "DOCKER_IMAGE must be tagged with an immutable Git commit SHA (e.g. image:abc1234). Mutable tags (e.g. 'latest') are rejected. Got: $DOCKER_IMAGE"
fi

if [ -z "$MIGRATOR_SHA" ]; then
    fatal "DOCKER_IMAGE_MIGRATOR must be tagged with an immutable Git commit SHA (e.g. migrator:migrator-abc1234). Got: $DOCKER_IMAGE_MIGRATOR"
fi

if [ "$APP_SHA" != "$MIGRATOR_SHA" ]; then
    fatal "Application SHA ($APP_SHA) does not match migrator SHA ($MIGRATOR_SHA). Images must come from the same commit."
fi

if [ -n "${COMMIT_SHA:-}" ] && [ "$COMMIT_SHA" != "unknown" ] && [ "$COMMIT_SHA" != "$APP_SHA" ]; then
    fatal "Explicit COMMIT_SHA ($COMMIT_SHA) does not match image tag SHA ($APP_SHA)."
fi

COMMIT_SHA="$APP_SHA"

export DOCKER_IMAGE
export DOCKER_IMAGE_MIGRATOR
export COMMIT_SHA

log "📦 Application image:  $DOCKER_IMAGE"
log "📦 Migrator image:     $DOCKER_IMAGE_MIGRATOR"
log "📦 Validated Commit:   $COMMIT_SHA"

# =============================================================================
# Step 4: Pull Immutable Images
# =============================================================================

log "📥 Pulling immutable images..."
docker pull "$DOCKER_IMAGE" || fatal "Failed to pull application image: $DOCKER_IMAGE"
docker pull "$DOCKER_IMAGE_MIGRATOR" || fatal "Failed to pull migrator image: $DOCKER_IMAGE_MIGRATOR"

# =============================================================================
# Step 5: Start Shared Dependencies (Without Recreating Existing Stateful Services)
# =============================================================================

log "🐘 Ensuring PostgreSQL and Redis services are running (without recreation)..."
docker compose -f "$COMPOSE_FILE" up -d --no-recreate postgres redis

# =============================================================================
# Step 6: Wait for PostgreSQL Readiness
# =============================================================================

log "⏳ Waiting for PostgreSQL readiness (user: $PG_USER)..."
DB_READY=false
for i in $(seq 1 15); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
        log "✅ PostgreSQL is ready!"
        DB_READY=true
        break
    fi
    log "  Waiting for PostgreSQL... (attempt $i/15)"
    sleep 4
done

if [ "$DB_READY" != "true" ]; then
    fatal "PostgreSQL did not become ready within 60 seconds."
fi

# =============================================================================
# Step 7: Phase A — Determine & Validate Active Release BEFORE Migrations
# =============================================================================

inspect_health() {
    local service="$1"
    local ids
    ids=$(docker compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null || true)
    if [ -z "$ids" ]; then
        echo "none"
        return
    fi
    local healthy_count=0
    local total_count=0
    for id in $ids; do
        total_count=$((total_count + 1))
        local status
        status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$id" 2>/dev/null || echo "unknown")
        if [ "$status" = "healthy" ]; then
            healthy_count=$((healthy_count + 1))
        fi
    done

    if [ "$healthy_count" -eq "$REPLICAS" ] && [ "$total_count" -eq "$REPLICAS" ]; then
        echo "healthy"
    elif [ "$healthy_count" -gt 0 ]; then
        warn "Release service '$service' has degraded capacity ($healthy_count/$REPLICAS healthy replicas)."
        echo "degraded"
    elif [ "$total_count" -gt 0 ]; then
        echo "unhealthy"
    else
        echo "none"
    fi
}

get_service_commit_sha() {
    local service="$1"
    local container_ids
    local first_sha=""
    local sha

    container_ids=$(docker compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null || true)
    if [ -z "$container_ids" ]; then
        return 1
    fi

    for cid in $container_ids; do
        sha=$(docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null | sed -n 's/^COMMIT_SHA=//p' | head -1 || true)

        if ! [[ "$sha" =~ ^[a-f0-9]{7,40}$ ]]; then
            return 1
        fi

        if [ -z "$first_sha" ]; then
            first_sha="$sha"
        elif [ "$sha" != "$first_sha" ]; then
            warn "Container drift detected in service '$service': replica commit $sha does not match $first_sha"
            return 1
        fi
    done

    printf '%s\n' "$first_sha"
}

DETECTED_ACTIVE=""
ACTIVE_COMMIT_SHA=""

determine_active_release() {
    DETECTED_ACTIVE=""
    ACTIVE_COMMIT_SHA=""

    local state_hint=""
    if [ -f "$STATE_FILE" ]; then
        state_hint=$(cat "$STATE_FILE" | tr -d '[:space:]')
    fi

    local upstream_hint=""
    if [ -f "$UPSTREAM_FILE" ]; then
        if grep -q "app-blue" "$UPSTREAM_FILE" 2>/dev/null; then
            upstream_hint="blue"
        elif grep -q "app-green" "$UPSTREAM_FILE" 2>/dev/null; then
            upstream_hint="green"
        fi
    fi

    local blue_health green_health
    blue_health=$(inspect_health "app-blue")
    green_health=$(inspect_health "app-green")

    # Check public Nginx readiness endpoint as primary evidence when Nginx is running
    local public_group=""
    local public_sha=""
    local public_resp
    public_resp=$(curl -sf "http://localhost:${PORT}/health/ready" 2>/dev/null || echo "")
    if [ -n "$public_resp" ]; then
        local p_status p_group p_sha
        p_status=$(echo "$public_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
        p_group=$(echo "$public_resp" | grep -o '"releaseGroup":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
        p_sha=$(echo "$public_resp" | grep -o '"commitSha":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
        if [ "$p_status" = "ready" ] && { [ "$p_group" = "blue" ] || [ "$p_group" = "green" ]; }; then
            public_group="$p_group"
            if [[ "$p_sha" =~ ^[a-f0-9]{7,40}$ ]]; then
                public_sha="$p_sha"
            fi
        fi
    fi

    log "  Active evidence — Public endpoint: group='${public_group:-none}', sha='${public_sha:-none}', Upstream hint: '${upstream_hint:-none}', State hint: '${state_hint:-none}', Blue health: '$blue_health', Green health: '$green_health'"

    # Check for state hint disagreement
    if [ -n "$state_hint" ] && [ -n "$upstream_hint" ] && [ "$state_hint" != "$upstream_hint" ]; then
        warn "⚠️ State file (.active-release) content ('$state_hint') disagrees with runtime Nginx upstream target ('$upstream_hint'). Aligning state with runtime."
    fi

    # First deployment detection (no release running)
    if [ "$blue_health" = "none" ] && [ "$green_health" = "none" ]; then
        DETECTED_ACTIVE="none"
        ACTIVE_COMMIT_SHA="none"
        return
    fi

    # If public endpoint responded with a valid ready release group:
    if [ -n "$public_group" ]; then
        local pub_health
        if [ "$public_group" = "blue" ]; then
            pub_health="$blue_health"
        else
            pub_health="$green_health"
        fi

        if [ "$pub_health" = "healthy" ] || [ "$pub_health" = "degraded" ]; then
            DETECTED_ACTIVE="$public_group"
            ACTIVE_COMMIT_SHA="${public_sha:-$(get_service_commit_sha "app-${public_group}" || echo "")}"
        else
            fatal "Public endpoint reports active release '$public_group', but its containers are in health state '$pub_health'. Cannot safely select active release."
        fi
    elif [ "$blue_health" != "none" ] && [ "$blue_health" != "unhealthy" ] && [ "$green_health" = "none" ]; then
        # Single blue release fallback
        DETECTED_ACTIVE="blue"
        ACTIVE_COMMIT_SHA=$(get_service_commit_sha "app-blue" || echo "")
    elif [ "$green_health" != "none" ] && [ "$green_health" != "unhealthy" ] && [ "$blue_health" = "none" ]; then
        # Single green release fallback
        DETECTED_ACTIVE="green"
        ACTIVE_COMMIT_SHA=$(get_service_commit_sha "app-green" || echo "")
    elif [ "$upstream_hint" = "blue" ] && { [ "$blue_health" = "healthy" ] || [ "$blue_health" = "degraded" ]; }; then
        # Both groups exist — upstream points to blue
        DETECTED_ACTIVE="blue"
        ACTIVE_COMMIT_SHA=$(get_service_commit_sha "app-blue" || echo "")
    elif [ "$upstream_hint" = "green" ] && { [ "$green_health" = "healthy" ] || [ "$green_health" = "degraded" ]; }; then
        # Both groups exist — upstream points to green
        DETECTED_ACTIVE="green"
        ACTIVE_COMMIT_SHA=$(get_service_commit_sha "app-green" || echo "")
    else
        # Reject unhealthy releases (0 healthy containers)
        if [ "$blue_health" = "unhealthy" ] || [ "$green_health" = "unhealthy" ]; then
            fatal "Release containers exist but have ZERO healthy replicas (blue='$blue_health', green='$green_health'). Unhealthy releases are rejected. Recovery required."
        fi
        fatal "Could not determine a valid, healthy active release. Runtime state is ambiguous or degraded. Recovery required."
    fi

    # Fail-safe SHA requirement for active releases:
    # When an active release is detected (blue or green), its commit SHA MUST be a valid 7-40 hex string.
    if [ "$DETECTED_ACTIVE" = "blue" ] || [ "$DETECTED_ACTIVE" = "green" ]; then
        if ! [[ "$ACTIVE_COMMIT_SHA" =~ ^[a-f0-9]{7,40}$ ]]; then
            fatal "Active release '$DETECTED_ACTIVE' detected, but its commit SHA ('${ACTIVE_COMMIT_SHA:-empty}') is invalid or missing. Deployment aborted before database migration."
        fi
    fi
}

# Run Phase A Pre-Migration Safety Check
determine_active_release
ACTIVE="$DETECTED_ACTIVE"
PREVIOUS_ACTIVE_SHA="$ACTIVE_COMMIT_SHA"

# Strict validation of active release variable
if [ "$ACTIVE" != "blue" ] && [ "$ACTIVE" != "green" ] && [ "$ACTIVE" != "none" ]; then
    fatal "Invalid active release detected: '$ACTIVE'. Must be exactly 'blue', 'green', or 'none'."
fi

# Align state file if active release determined
if [ "$ACTIVE" != "none" ]; then
    echo "$ACTIVE" > "$STATE_FILE"
fi

if [ "$ACTIVE" = "blue" ]; then
    CANDIDATE="green"
elif [ "$ACTIVE" = "green" ]; then
    CANDIDATE="blue"
else
    # First deployment
    CANDIDATE="blue"
    ACTIVE="none"
fi

CANDIDATE_SERVICE="app-${CANDIDATE}"

log "🔵 Pre-Migration Active Release: ${ACTIVE} (commit: ${PREVIOUS_ACTIVE_SHA})"
log "🟢 Planned Candidate Release:     ${CANDIDATE}"

# =============================================================================
# Step 8: Run Database Migrations
# =============================================================================

log "📊 Running database migrations via dedicated migrator image..."
if ! docker compose -f "$COMPOSE_FILE" run --rm migrator; then
    fatal "Database migration failed. Deployment aborted. Active release unchanged."
fi
log "✅ Database migrations completed successfully."

# =============================================================================
# Step 9: Phase B — Post-Migration Revalidation of Active Release & Commit SHA
# =============================================================================

log "🔍 Revalidating active production release state post-migration..."
determine_active_release
POST_MIG_ACTIVE="$DETECTED_ACTIVE"
POST_MIG_SHA="$ACTIVE_COMMIT_SHA"

if [ "$ACTIVE" != "none" ]; then
    if [ "$POST_MIG_ACTIVE" != "$ACTIVE" ]; then
        fatal "Post-migration revalidation failed: Active release group changed unexpectedly from '$ACTIVE' to '$POST_MIG_ACTIVE' during database migration! Aborting candidate rollout."
    fi

    if [ "$POST_MIG_SHA" != "$PREVIOUS_ACTIVE_SHA" ]; then
        fatal "Post-migration revalidation failed: Active release commit SHA changed unexpectedly from '$PREVIOUS_ACTIVE_SHA' to '$POST_MIG_SHA' during database migration! Aborting candidate rollout."
    fi

    log "✅ Post-migration revalidation passed — $ACTIVE (commit: $POST_MIG_SHA) remains healthy and active."
fi

# =============================================================================
# Error Trap — activate after confirming post-migration safety
# =============================================================================

trap 'rollback 1 "Unhandled error at line $LINENO"' ERR

# =============================================================================
# Step 10: Clean Stale Candidate, Start Fresh
# =============================================================================

log "🧹 Removing any leftover $CANDIDATE containers..."
docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" stop "$CANDIDATE_SERVICE" 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" rm -sf "$CANDIDATE_SERVICE" 2>/dev/null || true

log "🟢 Starting candidate release ($CANDIDATE) with $REPLICAS replicas..."
export APP_REPLICAS="$REPLICAS"

# Mark candidate started prior to Compose invocation so rollback cleans up on failure
CANDIDATE_STARTED=true

docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" up -d \
    --force-recreate \
    --scale "${CANDIDATE_SERVICE}=${REPLICAS}" \
    "$CANDIDATE_SERVICE"

# =============================================================================
# Step 11: Validate Every Candidate Container + Enforce Replica Count
# =============================================================================

log "🔍 Validating health of all $CANDIDATE containers..."

sleep 3

CANDIDATE_IDS=$(docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" ps -q "$CANDIDATE_SERVICE" 2>/dev/null || true)

if [ -z "$CANDIDATE_IDS" ]; then
    rollback 1 "No $CANDIDATE_SERVICE containers found after startup."
fi

CONTAINER_COUNT=$(echo "$CANDIDATE_IDS" | wc -l | tr -d ' ')
log "  Found $CONTAINER_COUNT candidate container(s), expected $REPLICAS."

if [ "$CONTAINER_COUNT" -ne "$REPLICAS" ]; then
    rollback 1 "Expected $REPLICAS candidate replicas, found $CONTAINER_COUNT. Aborting."
fi

ALL_HEALTHY=true

for container_id in $CANDIDATE_IDS; do
    SHORT_ID="${container_id:0:12}"
    log "  Checking container $SHORT_ID..."
    CONTAINER_OK=false

    for attempt in $(seq 1 20); do
        STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_id" 2>/dev/null || echo "unknown")

        if [ "$STATUS" = "healthy" ]; then
            log "    ✅ Container $SHORT_ID is healthy!"
            CONTAINER_OK=true
            break
        elif [ "$STATUS" = "unhealthy" ]; then
            error "    ❌ Container $SHORT_ID is unhealthy!"
            docker inspect --format='{{if .State.Health}}{{range .State.Health.Log}}{{.Output}}{{end}}{{end}}' "$container_id" 2>/dev/null | tail -5 || true
            break
        elif [ "$STATUS" = "no-healthcheck" ]; then
            error "    ❌ Container $SHORT_ID has no healthcheck configured!"
            break
        fi

        log "    Waiting for container $SHORT_ID (status: $STATUS, attempt $attempt/20)..."
        sleep 5
    done

    if [ "$CONTAINER_OK" != "true" ]; then
        ALL_HEALTHY=false
        break
    fi
done

if [ "$ALL_HEALTHY" != "true" ]; then
    rollback 1 "Candidate release ($CANDIDATE) failed health validation."
fi

log "✅ All $CONTAINER_COUNT candidate containers are healthy."

# =============================================================================
# Step 12: Switch Nginx Traffic to Candidate (In-Place File Write & Direct Reload)
# =============================================================================

log "🔄 Switching Nginx upstream to $CANDIDATE..."

# Write upstream file in-place so single-file Docker bind-mount updates existing inode
if ! cat "${UPSTREAM_DIR}/upstream-${CANDIDATE}.conf" > "$UPSTREAM_FILE"; then
    rollback 1 "Failed to update upstream configuration in-place for $CANDIDATE."
fi

NGINX_SWITCHED=true

# Start Nginx only if container does not exist (first deployment or manual removal).
# On existing deployments, DO NOT run 'docker compose up' — reload existing daemon directly.
NGINX_ID=$(docker compose -f "$COMPOSE_FILE" ps -q nginx 2>/dev/null || true)
if [ -z "$NGINX_ID" ]; then
    log "🚀 Nginx container not found — starting Nginx for first deployment..."
    docker compose -f "$COMPOSE_FILE" up -d nginx
    sleep 2
fi

# Test Nginx configuration
if ! docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -t 2>&1; then
    rollback 1 "Nginx configuration test failed after upstream switch."
fi

# Reload Nginx gracefully without container recreation
if ! docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload 2>&1; then
    rollback 1 "Nginx reload failed after upstream switch."
fi

log "✅ Nginx reloaded — traffic now routed to $CANDIDATE."

# =============================================================================
# Step 13: Validate Through Public Route (Strict Identity)
# =============================================================================

log "🌐 Validating through public Nginx endpoint..."
sleep 3

PUBLIC_OK=false
for attempt in $(seq 1 10); do
    RESPONSE=$(curl -sf "http://localhost:${PORT}/health/ready" 2>/dev/null || echo "")

    if [ -n "$RESPONSE" ]; then
        RESPONSE_STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
        RESPONSE_SHA=$(echo "$RESPONSE" | grep -o '"commitSha":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
        RESPONSE_GROUP=$(echo "$RESPONSE" | grep -o '"releaseGroup":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

        log "  Response: status=$RESPONSE_STATUS, sha=${RESPONSE_SHA:-?}, group=${RESPONSE_GROUP:-?}"

        if [ "$RESPONSE_STATUS" = "ready" ] && \
           [ "$RESPONSE_GROUP" = "$CANDIDATE" ] && \
           [ "$RESPONSE_SHA" = "$COMMIT_SHA" ]; then
            log "  ✅ Public validation passed — correct release confirmed."
            PUBLIC_OK=true
            break
        fi

        if [ "$RESPONSE_STATUS" != "ready" ]; then
            log "  ⏳ Status not ready yet..."
        fi
        if [ -n "$RESPONSE_GROUP" ] && [ "$RESPONSE_GROUP" != "$CANDIDATE" ]; then
            log "  ⏳ Release group mismatch: got=$RESPONSE_GROUP, expected=$CANDIDATE"
        fi
        if [ -n "$RESPONSE_SHA" ] && [ "$RESPONSE_SHA" != "$COMMIT_SHA" ]; then
            log "  ⏳ Commit SHA mismatch: got=$RESPONSE_SHA, expected=$COMMIT_SHA"
        fi
    fi

    log "  Waiting for public readiness (attempt $attempt/10)..."
    sleep 3
done

# =============================================================================
# Step 14: Roll Back if Public Validation Failed
# =============================================================================

if [ "$PUBLIC_OK" != "true" ]; then
    rollback 1 "Public readiness validation failed: release identity not confirmed after traffic switch."
fi

# =============================================================================
# Step 15: Retire Old Release (Connection Draining)
# =============================================================================

trap - ERR

if [ "$ACTIVE" != "none" ]; then
    OLD_SERVICE="app-${ACTIVE}"
    log "⏳ Draining connections from $ACTIVE (${DRAIN_SECONDS}s)..."
    sleep "$DRAIN_SECONDS"

    log "🧹 Stopping old release ($ACTIVE)..."
    docker compose -f "$COMPOSE_FILE" --profile "$ACTIVE" stop "$OLD_SERVICE" 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" --profile "$ACTIVE" rm -f "$OLD_SERVICE" 2>/dev/null || true
    log "✅ Old release ($ACTIVE) retired."
fi

# Persist active release & clean recovery marker on success
echo "$CANDIDATE" > "$STATE_FILE"
rm -f "$RECOVERY_MARKER" 2>/dev/null || true
log "📝 Active release persisted: $CANDIDATE"

# =============================================================================
# Image Cleanup
# =============================================================================

log "🧹 Pruning unused Docker images (keeping active + rollback)..."
docker image prune -f --filter "until=72h" 2>/dev/null || true

# =============================================================================
# Final Summary
# =============================================================================

log ""
log "==========================================="
log "✅ Deployment Successful!"
log "   Project:          $PROJECT_NAME"
log "   Active Release:   $CANDIDATE"
log "   Image:            $DOCKER_IMAGE"
log "   Commit SHA:       $COMMIT_SHA"
log "   Replicas:         $REPLICAS"
log "   Drain Seconds:    $DRAIN_SECONDS"
log "   Containers:       $(docker compose -f "$COMPOSE_FILE" --profile "$CANDIDATE" ps --format '{{.Name}}' "$CANDIDATE_SERVICE" 2>/dev/null | tr '\n' ' ')"
log "==========================================="