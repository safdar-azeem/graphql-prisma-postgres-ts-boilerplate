# Architecture

## Request flow

1. Fastify receives HTTP (trust proxy only when `TRUST_PROXY=true`).
2. Global rate limit and CORS/helmet run.
3. Mercurius builds request context via `createContext`:
   - Verifies access JWT (separate secret, issuer, audience, algorithm)
   - Loads the user from **PostgreSQL** (cache is never an auth fallback)
   - Rejects missing/deleted users and inactive user/workspace status (fail closed)
   - Resolves Prisma client from persisted `Workspace.shardId` with no silent fallback
   - Computes effective permissions
4. Resolver guards enforce auth + permissions + active workspace.
5. Thin resolvers call services.

## Core data model

### Workspace

Tenant boundary: `id`, `name`, `slug`, `status`, optional `shardId`, `ownerId`, timestamps.

Slug uniqueness is per database (shard). Slug is **not** used for authentication.

### User

Only authenticated identity model. Auth email uniqueness is enforced by:

1. Per-database `@unique` on `User.email`
2. Control-plane `GlobalEmailReservation` (written via default `DATABASE_URL` **before** shard insert)

Reservation lifecycle: `PENDING` (with `expiresAt`) → shard write → `ACTIVE` (stores `userId`, `workspaceId`, `shardId` for direct routing). Expired `PENDING` rows are **reconciled against the recorded shard** (activate if user exists; delete only if missing; keep if shard unavailable). Activation failure after a successful shard commit never releases the reservation. User deletion marks `RELEASE_PENDING` **before** the shard delete, then removes the reservation after success — so a control-plane outage cannot leave an undiscoverable `ACTIVE` orphan. See [MIGRATIONS.md](./MIGRATIONS.md).

Login / email resolve behavior:

| Reservation | Behavior |
|---|---|
| None | Temporary legacy cross-shard scan (backfill gap only) |
| `ACTIVE` | Exactly the recorded shard; never silent fallback |
| `PENDING` | Recorded shard only — activate if user exists; conflict if not ready; never scan |
| `RELEASE_PENDING` | Auth blocked until cleanup; never scan |

Shard scan is **only** for emails with **no** control-plane reservation row.

Fields include `workspaceId`, email, username, password hash, `userType` (`OWNER` | `MEMBER`), `status`, MFA/OAuth metadata, roles, `customPermissions`.

### Role

Workspace-scoped permissions array using catalog IDs. System `Admin` role assignment is owner-only.

## Ownership

Represented by both `User.userType = OWNER` and `Workspace.ownerId` (kept in sync transactionally). Partial unique index enforces one OWNER per workspace.

## Authorization

Permission catalog: [`src/authorization/permissions.ts`](../src/authorization/permissions.ts).

Access management is separated from profile updates:

| Permission | Capability |
|------------|------------|
| `users.update` | Profile fields only |
| `users.manageStatus` | Suspend / reactivate |
| `users.manageRoles` | Assign/remove roles |
| `users.managePermissions` | Custom permissions |

Grant rules for non-owners:

- Cannot modify their own roles/custom permissions
- Cannot grant a permission they do not possess
- Cannot assign a role containing permissions they cannot grant
- Cannot assign the system `Admin` role

## Authentication

- Separate `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` (required distinct in production; legacy `JWT_SECRET` fallback is development-only)
- Internal storage calls use `STORAGE_SERVICE_TOKEN_*` with `tokenType: storage-service` — not replayable as user access tokens
- Refresh rotation uses an atomic Redis consume-and-replace; reuse revokes all sessions
- Password-reset and OTP materials stored hashed
- MFA `is2faPending` tokens cannot access protected APIs; `verify2FA` re-checks active user/workspace
- Cache is an optional routing hint; cache outages fall through to PostgreSQL
- Queues are opt-in (`ENABLE_QUEUES=true`) and initialized only in `startQueues()`

## Database and sharding

- Default: single PostgreSQL database
- Optional sharding: persistent `Workspace.shardId`; invalid/missing shard fails the request
- Domain modules receive a request-scoped client; they do not call the sharding package

## Health

- `/health/live` — process up
- `/health/ready` — default/control `DATABASE_URL` responds to `SELECT 1` (and Redis when `REDIS_REQUIRED=true`). Optional shard degradation is reported as a count only; an unhealthy optional shard does not force `503` if the control DB is healthy.
