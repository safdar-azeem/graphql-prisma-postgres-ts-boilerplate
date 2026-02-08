# GraphQL, Prisma, Postgres, TypeScript Boilerplate

A production-ready GraphQL API boilerplate with built-in database sharding, authentication, and Docker deployment.

## 🚀 Tech Stack

- **Runtime**: Node.js v22+
- **Language**: TypeScript
- **Framework**: Fastify 5 + Mercurius (GraphQL)
- **Database**: PostgreSQL with Prisma ORM
- **Sharding**: [prisma-sharding](https://github.com/safdar-azeem/prisma-sharding)
- **Authentication**: [AuthLite](https://github.com/safdar-azeem/authlite)
- **Caching**: Redis
- **Deployment**: Docker + Nginx load balancer
- **Testing**: [Vitest](https://vitest.dev/)

## ⚡ Why Fastify + Mercurius?

This boilerplate uses **Fastify + Mercurius** instead of Express + Apollo Server for:

| Feature           | Fastify + Mercurius | Express + Apollo |
| ----------------- | ------------------- | ---------------- |
| Performance       | 🚀 Excellent        | Good             |
| Security defaults | ✅ Strong           | Manual setup     |
| Schema validation | ✅ Built-in         | Manual           |
| Request overhead  | Lower               | Higher           |
| Async/await       | Native              | Middleware-based |

---

## 🏃 Quick Start

### Option 1: Docker (Recommended)

```bash
git clone <repository_url>
cd graphql-prisma-postgres-ts-boilerplate
yarn docker:dev        # Start development environment (uses .env.docker)
yarn docker:migrate    # Run database migrations
```

Open http://localhost:3001/graphql

### Option 2: Local Development

Prerequisites: Node.js v22+, PostgreSQL, Redis running locally

> **Note:** Ensure your `.env` file uses `localhost` for `DATABASE_URL` and `REDIS_HOST`.

```bash
git clone <repository_url>
cd graphql-prisma-postgres-ts-boilerplate
yarn install
yarn migrate:shards    # Run database migrations
yarn dev               # Start development server
```

Server will start at: http://localhost:4200/graphql

---

## 🧪 Testing

### Automated Unit Tests (Vitest)

This project uses **Vitest** for unit testing, focusing on GraphQL resolvers and business logic. The tests are configured with a custom reporter for clean, action-oriented output.

```bash
yarn test
```

**Output Example:**

```text
Get user : SUCCESS
Create a new user : SUCCESS
Login user : SUCCESS
...
--- Test Summary ---
Total: 12
Passed: 12
Failed: 0
```

### Manual GraphQL Testing

### Option 1: Apollo Sandbox (Recommended)

The best GraphQL IDE experience! Open in your browser:

**https://studio.apollographql.com/sandbox/explorer**

Then connect to: `http://localhost:4200/graphql`

### Option 2: Built-in GraphiQL

Open: http://localhost:4200/graphiql

### Option 3: cURL

```bash
# Test introspection
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'

# Test a query
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { id email } }"}'

# With authentication
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query": "{ me { id email username } }"}'
```

### Option 4: Desktop Apps

- **[Altair](https://altairgraphql.dev/)** - Feature-rich GraphQL client
- **[Insomnia](https://insomnia.rest/)** - REST & GraphQL client
- **[Postman](https://www.postman.com/)** - API testing platform

---

## 📦 Commands

### Development

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `yarn dev`              | Start local dev server with hot-reload |
| `yarn docker:dev`       | Start Docker dev environment           |
| `yarn docker:dev:build` | Rebuild and start Docker dev           |
| `yarn docker:dev:logs`  | View Docker dev logs                   |
| `yarn docker:dev:down`  | Stop Docker dev containers             |

### Production

| Command                  | Description                         |
| ------------------------ | ----------------------------------- |
| `yarn build`             | Build production bundle             |
| `yarn start`             | Start production server             |
| `yarn docker:prod`       | Start Docker production environment |
| `yarn docker:prod:build` | Rebuild and start Docker prod       |
| `yarn docker:prod:logs`  | View Docker prod logs               |
| `yarn docker:prod:down`  | Stop Docker prod containers         |

### Database

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `yarn migrate:shards` | Apply schema to all database shards |
| `yarn db:sync`        | Sync schema changes (Local Dev)     |
| `yarn db:studio`      | Open Prisma Studio for all shards   |
| `yarn test:shards`    | Test shard connectivity             |
| `yarn docker:migrate` | Run migrations in Docker            |

### Utilities

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `yarn generate`     | Generate GraphQL types               |
| `yarn docker:clean` | Remove all Docker volumes and images |
| `yarn docker:sh`    | Shell into app container             |

---

## 🐳 Docker Architecture

```
├── Dockerfile               # Multi-stage (dev + prod stages)
├── docker-compose.yml       # Development environment (uses .env.docker)
├── docker-compose.prod.yml  # Production environment (uses .env)
├── .env                     # Local/Prod Configuration
└── nginx/nginx.conf         # Load balancer
```

The single Dockerfile contains both development and production stages:

- **Development**: `target: development` - hot-reload, dev dependencies
- **Production**: `target: production` - optimized, minimal image

---

## 🗄️ Database Sharding

Built-in horizontal sharding across multiple PostgreSQL instances:

```typescript
import { getShardForUser, findUserAcrossShards } from '@/config/prisma'

// Get shard for a specific user
const client = getShardForUser(userId)
const user = await client.user.findUnique({ where: { id: userId } })

// Find user across all shards
const { result } = await findUserAcrossShards(async (client) =>
  client.user.findFirst({ where: { email: 'user@example.com' } })
)
```

---

## 📂 Project Structure

```
src/
├── modules/           # Feature modules (auth, user, etc.)
│   └── <module>/
│       ├── graphql/   # GraphQL schema
│       └── resolvers/ # Business logic
├── config/            # Prisma, Redis, AuthLite config
├── middleware/        # Auth, CORS configuration
├── guards/            # Authentication guards
├── errors/            # Error handling & formatters
├── graphql/           # Scalars & base schema
├── types/             # Generated TypeScript types
├── utils/             # Shared utilities
└── server.ts          # Fastify entry point
```

---

## 🚀 Production Deployment

### VPS with GitHub Actions

This boilerplate uses **dynamic project naming** - your repository name becomes the project identifier, allowing multiple deployments on the same VPS without conflicts.

**Setup:**

1. Run on VPS: `curl -fsSL https://raw.githubusercontent.com/safdar-azeem/graphql-prisma-postgres-ts-boilerplate/main/scripts/setup-vps.sh | bash`
2. Set GitHub secrets:
   - `VPS_HOST` - Your VPS IP address
   - `VPS_USERNAME` - SSH username (usually `root`)
   - `VPS_SSH_KEY` - Private SSH key for authentication
   - `GH_SECRET` - GitHub Personal Access Token
3. Push to `main` branch → auto-deploys

See [docs/5-setup-vps-deployment.md](docs/5-setup-vps-deployment.md) for detailed VPS setup.

---

## 🐛 Troubleshooting

| Issue                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| Server exits immediately | Check `MFA_ENCRYPTION_KEY` is set (32 chars)       |
| Port already in use      | Kill process: `lsof -i :4200` then `kill -9 <PID>` |
| Docker build fails       | Run `yarn docker:clean` and try again              |
| Redis connection error   | Ensure Redis is running: `redis-server`            |
| GraphiQL not loading     | Use Apollo Sandbox instead (see Testing section)   |

---

## 📚 Documentation

- [Getting Started Guide](docs/1-getting-started.md)
- [Docker Guide](docs/2-docker.md)
- [GraphQL API Guide](docs/3-graphql-guide.md)
- [Sharding Design](docs/4-database-sharding.md)
- [VPS Setup](docs/5-setup-vps-deployment.md)

---

## 📊 Performance

Fastify + Mercurius provides excellent performance for GraphQL applications:

- **JIT Query Compilation** - Queries are compiled for faster execution
- **Automatic Loader Integration** - Prevents N+1 query problems
- **Query Parsing Cache** - Validated queries are cached
- **Low Request Overhead** - Fastify's async architecture

For benchmarking, use:

```bash
autocannon -c30 -d10 http://localhost:4200/health
```
