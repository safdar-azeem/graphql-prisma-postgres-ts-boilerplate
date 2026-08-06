# Development Guide

## Add a module

```text
src/modules/<module>/
  graphql/<module>.graphql
  resolvers/<module>.resolver.ts
  services/<module>.service.ts      # when there is business logic
  validation/<module>.schema.ts     # when inputs need normalization
  policies/<module>.policy.ts       # when resource checks are needed
  tests/
  index.ts
```

1. Add Prisma model under `prisma/schema/` if needed.
2. Author a migration: `npx prisma migrate dev --name describe_change`.
3. Apply it to all databases: `yarn db:update`.
4. Add GraphQL SDL under the module.
5. Implement service + thin resolver.
6. Register resolvers in `src/modules/index.ts`.
7. Run `yarn generate` (do not hand-edit `*.generated.*`).

## Add a GraphQL query / mutation

1. Extend `Query` or `Mutation` in the module `.graphql` file.
2. Wrap resolver with `requireAuth` or `Protect([PERMISSIONS.…], …)`.
3. Call the service; keep Prisma out of the resolver when logic is non-trivial.

## Typed filters, search, sort, pagination

List pattern:

```graphql
getThings(
  pagination: PaginationInput
  search: String
  filter: ThingFilterInput
  sort: ThingSortInput
): ThingConnection!
```

In the service:

- `getPagination` / `getPageInfo` from `src/utils/query.util.ts`
- Hard-code searchable fields
- `getSafeOrderBy` with an allow-list + default field
- Always filter by `workspaceId` from context

Do not expose arbitrary Prisma `orderBy`/`where` through GraphQL.

## Add a permission

1. Add a namespaced ID to `src/authorization/permissions.ts` (single source of truth).
2. Add the matching GraphQL enum **key** in `src/graphql/base.graphql` (e.g. `USERS_MANAGE_ROLES`).
3. `graphqlPermissions.ts` derives maps from `PERMISSIONS` automatically — keep the GraphQL enum keys identical to `PERMISSIONS` object keys.
4. Use `PERMISSIONS.…` in `Protect([...])`.

User access management:

- `users.update` — profile only
- `users.manageStatus` / `users.manageRoles` / `users.managePermissions` — separate mutations

Never scatter raw permission strings.

## Create a role

Use `createRole` with permissions from the GraphQL `Permissions` enum. System roles (`isSystem: true`) cannot be updated or deleted.

## Database workflow

Two commands:

```bash
yarn db:update    # validate config, generate client, apply migrations to all databases
yarn db:studio    # sharding-aware database browser
```

Do not use direct Prisma migration commands for database deployment or fleet synchronization. `prisma migrate dev` is permitted only for authoring a new migration file. Use `yarn db:update` to apply committed migrations across the control database and all shards.

### Author a new migration

```bash
npx prisma migrate dev --name describe_change
```

This is a migration-authoring operation only — it generates the migration SQL file against
`DATABASE_URL`. Once the migration is committed, `yarn db:update` applies it across all databases.

### Apply migrations

```bash
yarn db:update
```

`db:update` handles the complete fleet, including Prisma Client generation.

Do not run destructive schema sync at API startup.

## Workspace isolation checklist

- Context provides `workspaceId` and `client`.
- Queries use `{ id, workspaceId }` (or equivalent).
- Role IDs / user IDs referenced in mutations are validated to belong to the same workspace.

## Transactions

Use `client.$transaction` in services for multi-record writes (signup, ownership transfer).

## Queues

```ts
import { emailQueue } from '@/queues'
await emailQueue.add('send-email', { to, subject, html })
```

Workers start only when `ENABLE_QUEUES` is not `false`. Do not put secrets in job payloads.

## Errors

Throw `AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, or `DependencyUnavailableError` from `src/errors`.

## Generated files (do not edit)

- `src/types/types.generated.ts`
- `src/types/typeDefs.generated.ts`
- `src/types/resolvers.generated.ts`
- Prisma client under `node_modules/.prisma`

After SDL or Prisma schema changes, regenerate with `yarn generate`. Prisma Client is
generated automatically by `yarn db:update` and `yarn dev`.

## Validate before PR

```bash
yarn install --frozen-lockfile
yarn test:ci
yarn build
yarn db:update   # disposable DB — not force-reset
```

`yarn test` uses a compact reporter that still prints full failure details (file, message, expected/received, stack). Use `yarn test:verbose` or `yarn test:ci` for PR validation.

Integration coverage (disposable Postgres/Redis in CI) should eventually cover concurrent email reservation, ownership rollback, and real Redis refresh rotation. Unit tests with mocks do not replace that suite.
