# GraphQL + Prisma + PostgreSQL TypeScript API Boilerplate

Production-oriented modular monolith for multi-tenant APIs.

## Stack

- **Runtime:** Node.js 20+, TypeScript, ESM source / CJS bundle
- **HTTP:** Fastify
- **API:** GraphQL (Mercurius)
- **ORM:** Prisma 7 + PostgreSQL driver adapter
- **Auth:** JWT access/refresh, bcrypt, optional Google + MFA
- **Jobs:** Optional BullMQ + Redis
- **Tenancy:** `Workspace` + `User` + `Role` (no membership join table)
- **Identity:** globally unique authenticated email
- **Sharding:** optional `prisma-sharding` with persistent `Workspace.shardId`

## Architecture summary

```text
Request → Fastify → Mercurius → Auth context → Guard → Thin resolver → Service → Prisma (workspace-scoped)
```

- **Workspace** is the tenant and isolation boundary.
- **User** belongs to exactly one workspace (`OWNER` or `MEMBER`).
- **Role** is workspace-scoped; authorization uses stable permission IDs from `src/authorization/permissions.ts`.
- Sharding is optional and routed by `workspaceId` with persistent `Workspace.shardId`.

## Directory overview

```text
prisma/schema/          Prisma models (Workspace, User, Role, enums)
src/
  app.ts                Fastify construction
  server.ts             Process startup / shutdown
  authorization/        Permission catalog
  modules/              Feature modules (graphql, resolvers, services, …)
  config/               Prisma, Redis, tokens
  middleware/           Auth context, CORS, rate limit
  guards/               Protect / requireAuth
  queues/               Optional background jobs
docs/                   Architecture, development, operations
```

## Quick start

```bash
cp .env.example .env
yarn install
yarn dev
```

`yarn dev` validates shard configuration, generates the Prisma Client, applies committed
migrations to the control database and every configured shard, generates GraphQL types,
then starts the API and sharding-aware Studio.

GraphQL: `http://localhost:4200/graphql`
Studio: `http://localhost:51212`
Health: `/health/live`, `/health/ready`

## Environment

See [`.env.example`](.env.example) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

Minimum required:

- `DATABASE_URL`
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` / `STORAGE_SERVICE_TOKEN_SECRET` (min 32 chars each, distinct)
- `MFA_ENCRYPTION_KEY` (32 chars)

Queues are **opt-in** (`ENABLE_QUEUES=true`).

## Main scripts

| Script | Purpose |
|--------|---------|
| `yarn dev` | Update databases, generate types, start API + Studio |
| `yarn build` | Codegen + Prisma generate + esbuild bundle |
| `yarn test` | Vitest (compact reporter with full failure details) |
| `yarn test:ci` | Prisma generate + GraphQL generate + verbose tests |
| `yarn db:update` | Validate config, generate client, apply migrations to all databases |
| `yarn db:studio` | Sharding-aware database browser |
| `yarn generate` | GraphQL codegen |

## Database workflow

`yarn db:update` is the single command for all database synchronization:

```bash
yarn db:update
```

It validates shard configuration, generates the Prisma Client, preflights migration state,
applies committed migrations to the control database and every configured shard, and
reports failures clearly. Already-applied migrations are never re-run.

Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Migrations](docs/MIGRATIONS.md)
- [Operations & Security](docs/OPERATIONS.md)

## Important rules

- Do not edit `*.generated.*` files — regenerate with `yarn generate`.
- Do not authorize by role name; use permission IDs.
- Do not put password hashes in GraphQL context.
- Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards.
