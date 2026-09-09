# GraphQL Prisma PostgreSQL TypeScript Boilerplate

Backend boilerplate built with Node.js, TypeScript, Fastify, Mercurius, PostgreSQL,
Prisma, Prisma Sharding, Redis, BullMQ, and AuthLite.

Repository documentation is intentionally minimal while the database and application
architecture are being modernized.

## Commands

- `yarn dev` — start the development server
- `yarn build` — build the application
- `yarn start` — start the production build
- `yarn generate` — generate GraphQL types
- `yarn test` — run tests
- `yarn db:update` — run the existing Prisma Sharding update workflow
- `yarn db:studio` — run the existing Prisma Sharding Studio workflow
- `yarn test:shards` — run the existing shard connectivity workflow

`docker-compose.yml` provides PostgreSQL and Redis for local development. The default
environment uses the Compose `test` database as a single shard; multi-shard provisioning is
intentionally deferred to the Prisma Sharding modernization work.
