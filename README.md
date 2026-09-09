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

`User.id` is identity, while `User.ownerId` records application tenancy for managed users. Physical
`shardId` placement is infrastructure state maintained only by Prisma Sharding's built-in ownership
directory as `(namespace, routingKey) -> shardId`; it is not stored or used for routing by the
`User` model.

The ownership namespace `graphql-boilerplate-users` in `src/config/sharding.ts` is persistent data
identity and must not be changed after ownership records exist. Managed users do not receive
separate ownership records: their `ownerId` is the OWNER routing key. Use `allocateShard()` only to
establish ownership for a new OWNER, and `resolveShard()` whenever that ownership is already known.
See the Prisma Sharding package documentation for
[ownership and sharding behavior](https://github.com/safdar-azeem/prisma-sharding).
