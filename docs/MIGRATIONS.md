# Migrations

These are the migration SQL files included in this repository. Review the files under `prisma/migrations/` directly; the full contents are also inlined below for PR review bundles.

## Applying migrations

```bash
yarn db:update
```

`db:update` validates configuration, generates the Prisma Client, preflights every database,
applies committed migrations to the control database and all configured shards, checks for
schema drift, and exits non-zero if any target fails. Already-applied migrations are never
re-run.

Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards.

### Fresh empty database

```bash
yarn db:update
```

This applies all migrations from zero across the control database and every configured shard.

### Existing schema (prior `db push` / sharding sync)

Do **not** run migrations blindly on a non-empty database without migration history.

Configure a verified legacy baseline in `prisma-sharding.config.json`:

```json
{
  "migrations": {
    "legacyBaseline": {
      "until": "20260806000000_baseline",
      "verified": true
    }
  }
}
```

`until` is the newest migration whose schema **and** data effects you verified are already
present in every legacy database. `verified: true` is that explicit attestation.

Then run:

```bash
yarn db:update
```

On the next run, any database with tables but no `_prisma_migrations` history gets the
baseline recorded (history rows only — no SQL runs), and the remaining migrations are
applied normally:

```text
✅ shard_1  Baselined 1, 1 migration applied
```

Without a verified config, the run stops with a clear message and touches nothing:

```text
❌ shard_1  Legacy database detected: tables exist without Prisma migration history.

ℹ️  Configure migrations.legacyBaseline (prisma-sharding.config.json) before running yarn db:update.
No database was modified.
```

### Backfill after baseline

After baselining, migrations after the cutoff are applied normally. If later migrations
include data backfills, they run as committed SQL:

1. Backfill existing users into `GlobalEmailReservation` (`ACTIVE` with `userId`, `workspaceId`, `shardId`).
2. Validate duplicate emails and missing `Workspace.shardId` before enabling identity routing.

Do not use `db push --force-reset` / `--accept-data-loss` as merge evidence.

## Expand-contract migration policy

Blue-green deployment applies migrations **before** starting the candidate release. If the
candidate fails, traffic rolls back to the previous application version — which must still
work with the newly applied schema.

Every migration must be **backward-compatible** with the previous release:

| Operation | Expand (safe) | Contract (requires separate deployment) |
|-----------|---------------|----------------------------------------|
| Add nullable column | ✅ | — |
| Add table | ✅ | — |
| Add index | ✅ | — |
| Drop column | ❌ | ✅ Only after no running/rollback version reads it |
| Rename column | ❌ | Use add → backfill → switch code → remove |
| Drop table | ❌ | ✅ Only after all versions stopped using it |
| Change column type | ❌ | Add new column → backfill → switch code → remove |
| Add NOT NULL without default | ❌ | Add nullable → backfill → add constraint |

### Workflow

1. **Expand**: add new columns/tables in migration N. Both old and new code must tolerate
   the expanded schema.
2. **Switch**: deploy new code that writes to both old and new locations (or only new).
3. **Contract**: in a later migration, remove the old column/table. Only deploy this after
   confirming no running or rollback version depends on it.

### CI enforcement

Set `SHARD_STRICT_DRIFT=true` in CI and production so real schema drift fails validation.
Review every migration SQL for backward compatibility before merging.

## Email reservation policy

**Option B — reusable emails:** hard-delete marks the reservation `RELEASE_PENDING` **before** deleting the shard user, then deletes the reservation after the user is gone. If the final reservation delete fails, the row stays `RELEASE_PENDING` (discoverable by batch reconcile). If the pre-delete mark fails, the shard user is **not** deleted — no undiscoverable `ACTIVE` orphan.

### `RELEASE_PENDING` cleanup trigger

Run the operations command (or schedule it):

```bash
yarn identity:reconcile
# or single row:
yarn identity:reconcile --email=user@example.com --userId=<id>
```

`reconcileReleasePending` checks the recorded shard:

- `RELEASE_PENDING` + missing user → delete reservation
- `RELEASE_PENDING` + user still present → restore `ACTIVE`
- Unavailable shard → keep the row
- Orphan `ACTIVE` + confirmed missing user → delete (manual / single-row path)

Reservation lifecycle:

1. `PENDING` (+ `expiresAt`) before shard write
2. `ACTIVE` after successful activation (stores routing: `userId`, `workspaceId`, `shardId`)
3. Expired `PENDING` is reconciled against the recorded shard before any delete
4. `RELEASE_PENDING` marked **before** shard user delete; reservation removed after delete succeeds
5. Cleanup via `yarn identity:reconcile` / `reconcileAllReleasePending`

---

## File: `prisma/migrations/20260806000000_baseline/migration.sql`

```sql
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('EMAIL', 'AUTHENTICATOR');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "shardId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "userType" "UserType" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT NOT NULL,
    "googleId" TEXT,
    "mfaSettings" JSONB,
    "otp" JSONB,
    "passwordReset" JSONB,
    "customPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RoleToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoleToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ownerId_key" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_shardId_idx" ON "Workspace"("shardId");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE INDEX "User_userType_idx" ON "User"("userType");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_workspaceId_key" ON "User"("username", "workspaceId");

-- CreateIndex
CREATE INDEX "Role_workspaceId_idx" ON "Role"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_workspaceId_key" ON "Role"("name", "workspaceId");

-- CreateIndex
CREATE INDEX "_RoleToUser_B_index" ON "_RoleToUser"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one OWNER per workspace
CREATE UNIQUE INDEX "User_one_owner_per_workspace" ON "User"("workspaceId") WHERE "userType" = 'OWNER';
```

---

## File: `prisma/migrations/20260806120000_global_email_reservation/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "EmailReservationStatus" AS ENUM ('PENDING', 'ACTIVE', 'RELEASE_PENDING');

-- CreateTable
CREATE TABLE "GlobalEmailReservation" (
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "shardId" TEXT,
    "status" "EmailReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GlobalEmailReservation_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "GlobalEmailReservation_status_expiresAt_idx" ON "GlobalEmailReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GlobalEmailReservation_userId_idx" ON "GlobalEmailReservation"("userId");
```
