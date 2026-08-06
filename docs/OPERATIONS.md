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

## Database migrations

```bash
yarn db:generate
yarn db:deploy
```

Migrations (SQL reviewed in [MIGRATIONS.md](./MIGRATIONS.md)):

- `prisma/migrations/20260806000000_baseline/migration.sql` — Workspace, User, Role, global unique email, one-owner partial unique index
- `prisma/migrations/20260806120000_global_email_reservation/migration.sql` — control-plane reservation/routing table

Prefer migrate deploy over `db push` / force-reset. Never use `--force-reset` or `--accept-data-loss` as production acceptance evidence.

Validate:

1. Empty database: `yarn db:deploy`
2. Upgrade from prior schema with representative data (ownership, emails, roles)

## Queues

Queues are **opt-in**. With `ENABLE_QUEUES=false` (default):

- No BullMQ Queue or Worker is constructed
- `startQueues()` is a no-op
- Email uses direct SMTP when configured

Dashboard (`/admin/queues`) requires `ENABLE_QUEUE_DASHBOARD=true` and header `x-queue-dashboard-token`. Query-parameter tokens are not accepted.

## Health

| Path | Meaning |
|------|---------|
| `/health/live` | Process is running |
| `/health/ready` | Default/control `DATABASE_URL` answers `SELECT 1`; Redis if required |
| `/health` | Liveness-style OK |

Readiness reports `degradedShardCount` without exposing shard identifiers. An unhealthy optional shard does not force `503` when the control DB is healthy.

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
- After GraphQL/Prisma schema changes: `yarn db:generate && yarn generate`
- Prefer safe validation (codegen, tests, build) on relevant PRs; never edit generated files by hand
- CI should use `yarn install --frozen-lockfile` and `yarn test:ci`
