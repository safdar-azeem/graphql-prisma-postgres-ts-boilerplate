# Operations and Security

## Environment variables

See [`.env.example`](../.env.example).

Required at startup (`validateRuntimeSecrets`):

- `ACCESS_TOKEN_SECRET` — min 32 chars (must differ from refresh + storage secrets)
- `REFRESH_TOKEN_SECRET` — min 32 chars
- `STORAGE_SERVICE_TOKEN_SECRET` — min 32 chars; shared only with the storage service
- `MFA_ENCRYPTION_KEY` — exactly 32 chars
- `DATABASE_URL`

In **production**, equal access/refresh secrets and legacy `JWT_SECRET` fallback are rejected. Outside production, legacy fallback emits a startup warning.

| Variable | Notes |
|----------|--------|
| `ENABLE_QUEUES` | Default **false**. Must be `true` to create any Queue/Worker |
| `ENABLE_QUEUE_DASHBOARD` | Default **false**. Requires `QUEUE_DASHBOARD_TOKEN` header auth only |
| `TRUST_PROXY` | Enable only behind a trusted reverse proxy |
| `ALLOW_BATCHED_QUERIES` | Default `false` |
| `REDIS_REQUIRED` | When `true`, readiness fails if Redis is down |
| `SHARD_STRICT_DRIFT` | When `true`, schema drift fails validation (recommended for CI/production) |

## Database workflow

```bash
yarn db:update
```

`db:update` is the single command for all environments — local development, Docker, CI,
staging, and production. It validates shard configuration, generates the Prisma Client,
preflights migration state, applies committed migrations to the control database and every
configured shard, and reports failures clearly.

Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards.

Migrations (SQL reviewed in [MIGRATIONS.md](./MIGRATIONS.md)):

- `prisma/migrations/20260806000000_baseline/migration.sql` — Workspace, User, Role, global unique email, one-owner partial unique index
- `prisma/migrations/20260806120000_global_email_reservation/migration.sql` — control-plane reservation/routing table

Never use `--force-reset` or `--accept-data-loss` as production acceptance evidence.

For CI and production, set `SHARD_STRICT_DRIFT=true` to make real schema drift fail validation.

## Deployment lifecycle

### Overview

Production uses **blue-green deployment** with immutable Docker images. Two release groups
(`app-blue` and `app-green`) are defined as separate Compose services with Docker profiles.
Only one group serves traffic at any time. The canonical script is
[`scripts/deploy.sh`](../scripts/deploy.sh).

### Immutable images

GitHub Actions builds two Docker images per commit, tagged with the Git SHA:

| Image | Tag pattern | Target |
|-------|-------------|--------|
| Application | `ghcr.io/<owner>/<repo>:<sha>` | `production` Dockerfile stage |
| Migrator | `ghcr.io/<owner>/<repo>:migrator-<sha>` | `migrator` Dockerfile stage |

Both images share the same commit SHA. The deploy script validates SHA consistency and
rejects mismatched tags.

### Deployment locking

Two layers prevent concurrent deployments:

1. **GitHub Actions** — `concurrency: group: production-deploy, cancel-in-progress: false`
   serializes workflow runs. A second push queues behind the first.
2. **VPS `flock`** — `scripts/deploy.sh` acquires an exclusive file lock at
   `/tmp/$PROJECT_NAME-deploy.lock`. A second script invocation fails immediately.

### Deployment flow

1. **Acquire deployment lock** — acquire exclusive file lock (`flock`) at `/tmp/$PROJECT_NAME-deploy.lock`
   before reading runtime state, checking recovery markers, or pulling images.
2. **Pre-flight validation** — verify configuration parameters and check for `.deployment-recovery-required`
   marker file. If present from a previous unverified rollback, deployment is blocked immediately.
3. **Pull images** — both immutable images (`DOCKER_IMAGE` and `DOCKER_IMAGE_MIGRATOR`) are pulled explicitly.
   Missing or non-SHA image tags fail the deployment.
4. **Start shared deps** — PostgreSQL and Redis are started with `--no-recreate`. The script waits up to 60
   seconds for PostgreSQL readiness.
5. **Phase A: Pre-migration safety check** — inspect container health, query the public `/health/ready` endpoint,
   determine active release (`blue`, `green`, or `none`), capture `PREVIOUS_ACTIVE_SHA`, and reject zero-healthy-replica
   or ambiguous runtime states **before** touching the database.
6. **Run migrations** — the dedicated migrator container runs `yarn db:update`. Failure aborts deployment
   before any application containers change. The active release continues serving traffic.
7. **Phase B: Post-migration revalidation** — re-query active release group and commit SHA after migration.
   Confirm active production state (`ACTIVE` and `ACTIVE_COMMIT_SHA`) has not changed unexpectedly during migration
   before starting candidate containers.
8. **Clean stale candidate** — any leftover containers from a previous interrupted deployment are removed before starting.
9. **Start candidate** — the inactive release group is started with `--force-recreate` and `--scale` set to `$APP_REPLICAS`.
   Nginx does not route to it yet.
10. **Validate candidate** — verify exactly `$APP_REPLICAS` containers exist, then wait for every container to reach Docker `healthy`.
11. **Switch Nginx** — write the candidate upstream template in-place (`cat upstream-${CANDIDATE}.conf > active-upstream.conf`)
    on the host. Start Nginx if container is missing (first deployment) or send `nginx -s reload` directly to running daemon.
12. **Public validation** — bounded retry against `/health/ready` through public endpoint. All three conditions must match:
    `status == ready`, `commitSha == COMMIT_SHA`, `releaseGroup == CANDIDATE`. Any mismatch retries; exhaustion triggers rollback.
13. **Rollback** — if any step after candidate startup fails, restore old upstream. If rollback identity (`releaseGroup == ACTIVE`)
    is verified through public endpoint, candidate containers are removed. If rollback cannot be verified, both release groups are
    preserved and a `.deployment-recovery-required` marker file is created. On first deployment (`ACTIVE=none`), Nginx is stopped.
14. **Retire old release** — after connection drain period (`DRAIN_SECONDS`, default 15s), old containers are stopped and removed.
    The new release is persisted as active.

### Connection draining and long-lived requests

Nginx gracefully reloads worker processes upon receiving `nginx -s reload`, allowing existing
HTTP requests on active workers to complete while new connections route to the new upstream.

When retiring old release containers after Nginx switch:
- `DRAIN_SECONDS` (default `15` seconds) pauses execution before stopping old containers to allow
  in-flight HTTP requests and brief GraphQL operations to finish naturally.
- **WebSocket / Server-Sent Events (SSE)**: Long-lived connections require clients to implement
  automatic reconnection logic upon disconnect. If your application heavily relies on long-running
  subscriptions or large file uploads, increase `DRAIN_SECONDS` (e.g. `DRAIN_SECONDS=60`) to extend
  the graceful drain window prior to container shutdown.

### Migration safety and rollback

Migrations run **before** the candidate release starts. If the candidate later fails,
traffic rolls back to the previous application version — which must still work with the
newly applied schema. This is only safe when migrations follow the **expand-contract**
pattern documented in [MIGRATIONS.md](./MIGRATIONS.md#expand-contract-migration-policy).

Do not drop columns, rename tables, or add non-nullable constraints without defaults in
the same deployment that introduces the code change. Use separate expand and contract
deployments.

### Release groups

| Attribute | Blue | Green |
|-----------|------|-------|
| Compose service | `app-blue` | `app-green` |
| Docker profile | `blue` | `green` |
| Nginx upstream | `upstream-blue.conf` | `upstream-green.conf` |
| Environment var | `RELEASE_GROUP=blue` | `RELEASE_GROUP=green` |

Active and inactive groups are distinguishable by service name, container IDs, image SHA,
Nginx upstream target, and Docker health status.

### Rollback

Rollback behavior depends on whether the restored release identity can be verified through the public Nginx endpoint:

#### Verified Rollback
Occurs when the previous release (`releaseGroup == ACTIVE`) is confirmed healthy through the public Nginx endpoint after restoring `active-upstream.conf`:
- Candidate containers (`app-blue` or `app-green`) are stopped and removed.
- Active release continues serving traffic without interruption.
- Deployment script exits non-zero.

#### Unverified Rollback
Occurs when traffic was switched to the candidate but the previous release cannot be verified through the public endpoint after restoring `active-upstream.conf`:
- **Both release groups are preserved**: candidate containers are NOT removed to prevent leaving Nginx pointing to stopped containers.
- **Recovery marker created**: `.deployment-recovery-required` is written to `$APP_DIR`, blocking subsequent automated deployments.
- Deployment script logs a critical error requiring immediate manual intervention.
- Deployment script exits non-zero.
- Operators must inspect container health (`docker compose ps`), public readiness (`/health/ready`), and Nginx routing (`nginx/active-upstream.conf`), then remove `.deployment-recovery-required` after manual recovery.

#### Manual Rollback
To redeploy a known-good previous image:

```bash
export DOCKER_IMAGE="ghcr.io/<owner>/<repo>:<previous-sha>"
export DOCKER_IMAGE_MIGRATOR="ghcr.io/<owner>/<repo>:migrator-<previous-sha>"
export COMMIT_SHA="<previous-sha>"
./scripts/deploy.sh
```

### Environment variables for deployment

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_IMAGE` | (required) | Immutable application image tag (must end in Git SHA) |
| `DOCKER_IMAGE_MIGRATOR` | (required) | Immutable migrator image tag (must end in Git SHA) |
| `COMMIT_SHA` | extracted from tag | Git commit SHA for verification |
| `APP_REPLICAS` | `3` | Replicas per release group |
| `DRAIN_SECONDS` | `15` | Connection drain wait before retiring old release |
| `PROJECT_NAME` | directory name | Compose project name |

## Health

| Path | Purpose | Production rollout gate? |
|------|---------|------------------------|
| `/health/live` | Process is running | No |
| `/health/ready` | Database `SELECT 1` + Redis (if required) + `commitSha` + `releaseGroup` | **Yes** |
| `/health` | Liveness-style OK | No |

`/health/ready` is the production rollout gate. Both the Dockerfile `HEALTHCHECK` and the
deploy script use it. Readiness reports `degradedShardCount` without exposing shard
identifiers. An unhealthy optional shard does not force `503` when the control DB is healthy.

## Queues

Queues are **opt-in**. With `ENABLE_QUEUES=false` (default):

- No BullMQ Queue or Worker is constructed
- `startQueues()` is a no-op
- Email uses direct SMTP when configured

Dashboard (`/admin/queues`) requires `ENABLE_QUEUE_DASHBOARD=true` and header `x-queue-dashboard-token`. Query-parameter tokens are not accepted.

## Security rules

- Never put password hashes in GraphQL context or Redis user cache
- Cache must not keep deleted users authenticated; cache outages fall through to DB
- Persisted `Workspace.shardId` must never silently fall back to another database
- Rate limits use verified JWTs only for the authenticated bucket
- Separate access/refresh/storage secrets; explicit issuer/audience/algorithm and token purpose
- Auth email uniqueness uses control-plane `GlobalEmailReservation` (`PENDING`/`ACTIVE`, expiry, routing fields) + per-DB unique index
- User deletion marks `RELEASE_PENDING` before shard delete, then finalizes reservation removal — see [MIGRATIONS.md](./MIGRATIONS.md)
- Complete stuck `RELEASE_PENDING` rows with `yarn identity:reconcile` (batch or `--email=` / `--userId=`); missing users are released, surviving users are restored to `ACTIVE`
- Non-active identity states (`PENDING`, `RELEASE_PENDING`) never enter the legacy shard scan; only missing reservations may scan
- `ACTIVE` identity routes never silently fall back to other shards
- Access management permissions are separate from `users.update`

## Upgrade policy

- Align Node engine, Docker image, CI, and `@types/node`
- After GraphQL/Prisma schema changes: `yarn db:update && yarn generate`
- Prefer safe validation (codegen, tests, build) on relevant PRs; never edit generated files by hand
- CI should use `yarn install --frozen-lockfile` and `yarn test:ci`
