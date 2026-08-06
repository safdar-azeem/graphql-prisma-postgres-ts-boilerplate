# Agent Notes

This repository is a generic GraphQL + Prisma + PostgreSQL API boilerplate.

## Canonical docs

1. [README.md](README.md)
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
4. [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Non-negotiables

- Work only in this repository unless the user says otherwise.
- **Never edit generated files manually** (`*.generated.*`, Prisma client output).
- **Never run destructive migration or database reset commands** without explicit approval.
- When validating relevant changes, agents **should** run safe generation, type checks, tests, and builds when the user has approved those Ring 3+ actions.
- Tenant model is `Workspace` + `User` + `Role`. No `WorkspaceMember`.
- User types are only `OWNER` and `MEMBER`.
- Authenticated email is **globally unique**.
- Authorize with `src/authorization/permissions.ts` IDs, not role names.
- Separate `users.update` from `users.manageRoles` / `users.managePermissions` / `users.manageStatus`.
- Keep resolvers thin; put business logic in services.
- Scope every data access by `workspaceId`.
- Never put password hashes in GraphQL context.
- Never use cache as an authentication fallback when the database user is missing.
- Never silently fall back from a persisted `Workspace.shardId` to another shard.
- **Database workflow:** Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards. `yarn db:studio` opens sharding-aware Studio.
- **Migration safety:** All migrations must follow the expand-contract pattern (see [MIGRATIONS.md](docs/MIGRATIONS.md#expand-contract-migration-policy)). Do not drop columns, rename tables, or add non-nullable constraints without defaults in the same deployment that introduces the code change. The previous application version must remain compatible with the newly applied schema for safe rollback.

## Module pattern

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
