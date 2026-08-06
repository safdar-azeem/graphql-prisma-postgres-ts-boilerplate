# Migrations

## Included SQL

### `prisma/migrations/20260806000000_baseline/migration.sql`

Creates:

- Enums: `UserType` (`OWNER` | `MEMBER`), `UserStatus`, `WorkspaceStatus`, `MfaMethod`
- Tables: `Workspace`, `User`, `Role`, `_RoleToUser`
- Unique `User.email`
- Partial unique index enforcing one OWNER per workspace:

```sql
CREATE UNIQUE INDEX "User_one_owner_per_workspace" ON "User"("workspaceId") WHERE "userType" = 'OWNER';
```

### `prisma/migrations/20260806120000_global_email_reservation/migration.sql`

Creates control-plane identity reservation/routing:

- Enum `EmailReservationStatus` (`PENDING` | `ACTIVE`)
- Table `GlobalEmailReservation` with `email`, `userId`, `workspaceId`, `shardId`, `status`, timestamps, `expiresAt`

## Deploy validation

```bash
yarn db:generate
yarn db:deploy
```

Validate against:

1. Empty disposable database
2. Disposable copy of the previous boilerplate schema (backfill identity rows for existing users before enabling multi-shard signup if upgrading)

Do not use `db push --force-reset` as merge evidence.

## Email reservation policy

**Option B — reusable emails:** hard-deleting a user releases the matching reservation (`email` + `userId`). Deleted addresses may be signed up again.
