# AGENTS.md — AI Agent Documentation

> GraphQL API boilerplate with Prisma ORM, PostgreSQL sharding, TypeScript, and Fastify.

---

## Quick Reference

| Action                 | Command               |
| ---------------------- | --------------------- |
| Install dependencies   | `yarn install`        |
| Start dev server       | `yarn dev`            |
| Run tests              | `yarn test`           |
| Build production       | `yarn build`          |
| Start Docker dev       | `yarn docker:dev`     |
| Run migrations         | `yarn migrate:shards` |
| Generate GraphQL types | `yarn generate`       |

---

## Tech Stack

| Component           | Technology                      |
| ------------------- | ------------------------------- |
| **Runtime**         | Node.js 22+                     |
| **Language**        | TypeScript (strict mode)        |
| **Framework**       | Fastify 5 + Mercurius (GraphQL) |
| **Database**        | PostgreSQL with Prisma ORM      |
| **Sharding**        | prisma-sharding library         |
| **Auth**            | AuthLite (JWT-based)            |
| **Cache**           | Redis (ioredis)                 |
| **Testing**         | Vitest                          |
| **Package Manager** | Yarn                            |

---

## Project Structure

```text
src/
├── server.ts              # 🚀 Application Entry Point
├── constants/             # Global constants (ENV vars)
├── types/                 # Generated GraphQL & Context types
├── config/                # Service configurations
│   ├── prisma.ts          # 🛡️ Sharding configuration & Client
│   ├── redis.ts           # 🧠 Redis connection
│   └── authlite.ts        # 🔐 Auth configuration
├── middleware/            # Fastify Middlewares
│   ├── auth.middleware.ts # JWT -> User Context
│   └── rateLimit.ts       # Hybrid IP/User rate limiting
├── modules/               # 📦 Feature Modules (Domain Driven)
│   ├── auth/              # Login, Signup, 2FA
│   ├── user/              # User profile & management
│   ├── upload/            # File handling bridge
│   └── index.ts           # Resolver merger
├── graphql/               # Global schemas (Scalars, Base)
└── utils/                 # Shared utilities (Email, Crypto)

```

## 🧩 Module Pattern

Each module in `src/modules/<name>` MUST contain:

- `graphql/<name>.graphql`: Schema definition.
- `resolvers/<name>.resolver.ts`: Logic implementation.
- `services/<name>.service.ts`: (Optional) Complex business logic.
- `types/`: Module-specific types.
  EOF

---

## Development Workflow

### Local Development (with Docker)

```bash
# 1. Start Docker containers (Postgres, Redis)
yarn docker:dev

# 2. Run database migrations
yarn migrate:shards

# 3. Start dev server (opens at http://localhost:4200/graphql)
yarn dev
```

### Local Development (Recommended)

**Prerequisites**: Node.js 22+, PostgreSQL, Redis running locally

```bash
# 1. Install dependencies
yarn install

# 2. Configure .env (update REDIS_HOST=localhost, DATABASE_URL)

# 3. Run migrations
yarn migrate:shards

# 4. Start dev server
yarn dev
```

### Testing GraphQL

- **GraphQL Playground**: http://localhost:4200/graphiql
- **Apollo Sandbox**: https://studio.apollographql.com/sandbox (connect to `http://localhost:4200/graphql`)

---

## Code Conventions

1. Consistency: Ensure your code follows the existing style, naming conventions, and structure of the project.
1. Modularity: Keep the codebase modular. Break things down into clear, focused smaller files. Use consistent naming conventions (prefixes for files/folders) to maintain organization.
1. Error-Free & Clean: Ensure code has no syntax or logical errors.
1. Add comments only when absolutely necessary only complex logic.
1. Performance: Optimize for performance (memoization, caching, indexing) where applicable. Use parallelism (e.g., Promise.all()) only when it adds value.
1. ⁠For large datasets or complex CRUD operations, use batching to minimize overhead and boost performance.
1. Always apply DSA, OOP, SOLID principles, and industry best practices where appropriate.
1. The codebase should be modular. Use smaller, well-structured files. Do not place everything into a single large file.

---

## Common Tasks

### Adding a New GraphQL Module

```bash
# 1. Create module directory
mkdir -p src/modules/<name>/graphql src/modules/<name>/resolvers

# 2. Create schema file
# src/modules/<name>/graphql/<Name>.graphql

# 3. Create resolver file
# src/modules/<name>/resolvers/<Name>.ts

# 4. Export from modules index
# Edit src/modules/index.ts

# 5. Generate types
yarn generate
```

### Making Database Changes

```bash
# 1. Edit schema
# prisma/schema.prisma

# 2. Apply to all shards
yarn migrate:shards

# 3. Regenerate Prisma client
yarn prisma:generate
```

### Running Tests

```bash
# Run all tests
yarn test

# Tests are in tests/ directory
# Uses Vitest with custom reporter
```

---

## Docker Commands

| Environment | Start              | Build & Start            | Logs                    | Stop                    |
| ----------- | ------------------ | ------------------------ | ----------------------- | ----------------------- |
| **Dev**     | `yarn docker:dev`  | `yarn docker:dev:build`  | `yarn docker:dev:logs`  | `yarn docker:dev:down`  |
| **Prod**    | `yarn docker:prod` | `yarn docker:prod:build` | `yarn docker:prod:logs` | `yarn docker:prod:down` |

**Additional:**

- `yarn docker:migrate` — Run migrations in Docker
- `yarn docker:sh` — Shell into app container
- `yarn docker:clean` — Remove all volumes and images

---

## Environment Variables

Key environment variables (see `.env` for full list):

| Variable             | Description                 |
| -------------------- | --------------------------- |
| `DATABASE_URL`       | Main PostgreSQL connection  |
| `SHARD_*_URL`        | Shard database connections  |
| `REDIS_HOST`         | Redis hostname              |
| `JWT_SECRET`         | JWT signing secret          |
| `MFA_ENCRYPTION_KEY` | 32-char encryption key      |
| `PORT`               | Server port (default: 4200) |

---

## Architecture Notes

### ## 🌐 Database Sharding Strategy

### ❌ WRONG (Single DB)

```typescript
// Don't do this - it ignores shards
const user = await prisma.user.findFirst(...)

```

### ✅ CORRECT (Sharded)

Uses `prisma-sharding` for horizontal scaling across multiple PostgreSQL instances:

```typescript
import { getShardForUser, findUserAcrossShards } from '@/config/prisma'

// Query specific shard
const client = getShardForUser(userId)
const user = await client.user.findUnique({ where: { id: userId } })

// Query across all shards
const { result } = await findUserAcrossShards(async (client) =>
  client.user.findFirst({ where: { email } })
)
```

### ✅ CORRECT Client Access In Resolvers

in resolvers, access Prisa Client via context.

```typescript
 userPosts: requireAuth(async (_parent, _args, { user, client }) => {
    // 'client' is already the correct DB shard for 'user'
    const posts = await client.post.findMany({ where: { userId: user.id } })
    return posts
  }),
```

## 🔐 Authentication Flow

1. **Transport**: Bearer Token (JWT).
2. **Middleware**: `auth.middleware.ts` decodes token.
3. **Context**: Attaches `user` and `client` (the specific DB shard for that user) to GraphQL context.
4. **Guards**: `requireAuth` wrapper protects resolvers.
5. **AuthLite**: Uses AuthLite with JWT tokens:

---

## Error Handling

Never throw raw Javascript `Error`. Use the typed error classes:

- `AuthenticationError`: User is not logged in.
- `AuthorizationError`: User lacks permissions.
- `ValidationError`: Bad input.
- `NotFoundError`: Resource missing.
- `InternalError`: System failure.

## Troubleshooting

| Issue                           | Solution                                       |
| ------------------------------- | ---------------------------------------------- |
| Server exits immediately        | Check `MFA_ENCRYPTION_KEY` is exactly 32 chars |
| Port 4200 in use                | `lsof -i :4200` then `kill -9 <PID>`           |
| Docker build fails              | `yarn docker:clean` and retry                  |
| Redis connection error          | Ensure Redis is running                        |
| Type errors after schema change | Run `yarn generate`                            |

---

## Additional Documentation

For detailed guides, see `/docs/`:

- [Getting Started](docs/1-getting-started.md)
- [Docker Guide](docs/2-docker.md)
- [GraphQL API Guide](docs/3-graphql-guide.md)
- [Database Sharding](docs/4-database-sharding.md)
- [VPS Deployment](docs/5-setup-vps-deployment.md)
- [Rate Limiting](docs/6-rate-limiting.md)
