# GraphQL Prisma PostgreSQL TypeScript Boilerplate

Backend boilerplate built with Node.js, TypeScript, Fastify, Mercurius, PostgreSQL,
Prisma 7, Prisma Sharding 1.3.1, Redis, BullMQ, and AuthLite.

Repository documentation is intentionally minimal while the database and application
architecture are being modernized.

## Commands

- `yarn dev` — start the development server
- `yarn build` — build the application
- `yarn start` — start the production build
- `yarn generate` — generate the Prisma client and GraphQL types
- `yarn test` — run tests
- `yarn db:update` — generate the Prisma client and apply committed migrations to every shard
- `yarn db:studio` — inspect all configured shards in Prisma Studio
- `yarn test:shards` — run the read-only shard connectivity diagnostic

`docker-compose.yml` provides PostgreSQL and Redis for local development. The default
environment uses the Compose `test` database for the Prisma CLI datasource, built-in ownership
directory, and single application shard.

An OWNER/root User ID is the durable routing key for that User and its managed sub-users. New
OWNERs are placed with `allocateShard()`; managed users stay on their OWNER's resolved shard; and
issued access/refresh tokens carry the OWNER routing key so authenticated requests use
`resolveShard()`. `findAcrossShards()` is reserved for discovery by email, username, or
password-reset token. Configure `DATABASE_URL`, `SHARD_DIRECTORY_URL`, `SHARD_COUNT`, and each
`SHARD_N_URL` as shown in `.env.example`.

The ownership namespace in `src/config/sharding.ts` is persistent data identity and must not be
changed after ownership records exist. Deployments with Users created by the legacy integration
must populate the built-in ownership directory before serving traffic; Prisma Sharding does not
automatically repair missing historical ownership. See the Prisma Sharding package documentation
for [ownership and migration operations](https://github.com/safdar-azeem/prisma-sharding).

### Upgrade prerequisites

The committed schema-completion migration intentionally does not invent passwords for rows that
exist at the old `User(id, email, username)` migration state. If such rows exist, PostgreSQL stops
the migration transaction at the required `password` column. Reconcile those credentials and the
live schema under operator review, then use Prisma Sharding's documented automatic migration-history
adoption; use `prisma-sharding-baseline` only for a reviewed exception that adoption cannot prove.

This release also intentionally requires the new OWNER `routingKey` claim in access and refresh
tokens. Tokens issued before this upgrade are rejected, so deployments must treat the rollout as a
forced sign-in and revoke/clear existing sessions. This avoids global ID searches or legacy routing
fallbacks that would weaken the durable-ownership contract.
