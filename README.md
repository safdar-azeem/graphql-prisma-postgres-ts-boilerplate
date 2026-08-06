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
yarn db:generate
yarn db:deploy          # or yarn db:migrate:dev for local iteration
yarn generate           # GraphQL codegen
yarn dev
```

GraphQL: `http://localhost:4200/graphql`  
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
| `yarn dev` | Generate GraphQL types + run API |
| `yarn build` | Codegen + Prisma generate + esbuild bundle |
| `yarn test` | Vitest (custom reporter with full failure details) |
| `yarn test:verbose` | Vitest verbose reporter |
| `yarn test:ci` | `db:generate` + GraphQL generate + verbose tests |
| `yarn db:generate` | Prisma client |
| `yarn db:deploy` | Apply migrations |
| `yarn db:migrate` | Sharding-aware migrate helper |
| `yarn generate` | GraphQL codegen |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Operations & Security](docs/OPERATIONS.md)

## Important rules

- Do not edit `*.generated.*` files — regenerate with `yarn generate`.
- Do not authorize by role name; use permission IDs.
- Do not put password hashes in GraphQL context.
- Prefer migrate deploy over `db push` for schema changes.
