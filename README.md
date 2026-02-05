# GraphQL, Prisma, Postgres, TypeScript Boilerplate

A production-ready GraphQL API boilerplate with built-in database sharding, authentication, and Docker deployment.

## 🚀 Tech Stack

- **Runtime**: Node.js v22
- **Language**: TypeScript
- **Framework**: Express 5 + Apollo Server (GraphQL)
- **Database**: PostgreSQL with Prisma ORM
- **Sharding**: [prisma-sharding](https://github.com/safdar-azeem/prisma-sharding)
- **Authentication**: [AuthLite](https://github.com/safdar-azeem/authlite)
- **Caching**: Redis
- **Deployment**: Docker + Nginx load balancer

## 🏃 Quick Start

### Option 1: Docker (Recommended)

```bash
git clone <repository_url>
cd graphql-prisma-postgres-ts-boilerplate
yarn docker:dev        # Start development environment
yarn docker:migrate    # Run database migrations
```

Open http://localhost:3001/graphql

### Option 2: Local Development

Prerequisites: Node.js v20+, PostgreSQL, Redis running locally

```bash
git clone <repository_url>
cd graphql-prisma-postgres-ts-boilerplate
yarn install
yarn migrate:shards    # Run database migrations
yarn dev               # Start development server
```

Open http://localhost:4000/graphql

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
| `yarn db:studio`      | Open Prisma Studio for all shards   |
| `yarn test:shards`    | Test shard connectivity             |
| `yarn docker:migrate` | Run migrations in Docker            |

### Utilities

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `yarn generate`     | Generate GraphQL types               |
| `yarn docker:clean` | Remove all Docker volumes and images |
| `yarn docker:sh`    | Shell into app container             |

## 🐳 Docker Architecture

```
├── Dockerfile               # Multi-stage (dev + prod stages)
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment
├── .env                     # Configuration (committed)
└── nginx/nginx.conf         # Load balancer
```

The single Dockerfile contains both development and production stages:

- **Development**: `target: development` - hot-reload, dev dependencies
- **Production**: `target: production` - optimized, minimal image

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

## 📂 Project Structure

```
src/
├── modules/           # Feature modules (auth, user, etc.)
│   └── <module>/
│       ├── graphql/   # GraphQL schema
│       └── resolvers/ # Business logic
├── config/            # Prisma, AuthLite config
├── middleware/        # Auth, CORS middleware
├── guards/            # Authentication guards
├── errors/            # Error handling
├── utils/             # Shared utilities
└── server.ts          # Entry point
```

## 🚀 Production Deployment

### VPS with GitHub Actions

1. Set GitHub secrets: `VPS_HOST`, `VPS_USERNAME`, `VPS_PASSWORD`
2. Update `.env` with production values
3. Push to `main` branch → auto-deploys

See [docs/setup-vps.md](docs/setup-vps.md) for detailed VPS setup.

## 🐛 Troubleshooting

| Issue                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| Server exits immediately | Check `MFA_ENCRYPTION_KEY` is set (32 chars)       |
| Port already in use      | Kill process: `lsof -i :4000` then `kill -9 <PID>` |
| Docker build fails       | Run `yarn docker:clean` and try again              |

## 📚 Documentation

- [Docker Guide](docs/docker.md)
- [VPS Setup](docs/setup-vps.md)
- [Sharding Design](docs/system-design-sharding.md)
