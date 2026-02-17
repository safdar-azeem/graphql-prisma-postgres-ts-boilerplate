# Getting Started Guide

Complete step-by-step guide for new developers to set up and run this GraphQL API boilerplate.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Tool       | Version | Check Command            | Install Guide                                          |
| ---------- | ------- | ------------------------ | ------------------------------------------------------ |
| Node.js    | v22+    | `node --version`         | [nodejs.org](https://nodejs.org/)                      |
| Yarn       | 1.22+   | `yarn --version`         | `npm install -g yarn`                                  |
| PostgreSQL | 14+     | `psql --version`         | [postgresql.org](https://www.postgresql.org/download/) |
| Redis      | 6+      | `redis-server --version` | [redis.io](https://redis.io/download/)                 |
| Docker     | 20+     | `docker --version`       | [docker.com](https://www.docker.com/get-started/)      |

---

## 🚀 Step 1: Clone & Install

```bash
# Clone the repository
git clone <repository_url>
cd graphql-prisma-postgres-ts-boilerplate

# Install dependencies
yarn install
```

---

## 🔧 Step 2: Environment Setup

### Copy and configure environment variables:

```bash
# The .env file is already configured with defaults
# Review and update as needed:
cat .env
```

**Important environment variables:**

| Variable             | Description                   | Default              |
| -------------------- | ----------------------------- | -------------------- |
| `PORT`               | Server port                   | `4200`               |
| `NODE_ENV`           | Environment mode              | `development`        |
| `JWT_SECRET`         | JWT signing secret            | (set this!)          |
| `MFA_ENCRYPTION_KEY` | 2FA encryption key (32 chars) | (set this!)          |
| `REDIS_URL`          | Redis connection URL          | `redis://redis:6379` |
| `DATABASE_URL_*`     | PostgreSQL shard URLs         | (see sharding docs)  |

---

## 🐳 Step 3: Start Services

### Option A: Using Docker (Recommended for beginners)

```bash
# Start all services (PostgreSQL, Redis, App)
yarn docker:dev

# Wait for services to start, then run migrations
yarn docker:migrate

# View logs
yarn docker:dev:logs
```

### Option B: Local Development

**Start PostgreSQL:**

```bash
# macOS (Homebrew)
brew services start postgresql

# Ubuntu/Debian
sudo systemctl start postgresql

# Windows
# Start from Services or pgAdmin
```

**Start Redis:**

```bash
# macOS (Homebrew)
brew services start redis

# Ubuntu/Debian
sudo systemctl start redis-server

# Or run directly
redis-server
```

**Run the app:**

```bash
# generates Prisma Client types and migrates all shards
yarn db:update

# Start development server
yarn dev
```

---

## ✅ Step 4: Verify Installation

### Check server is running:

```bash
# Health check
curl http://localhost:4200/health
# Expected: OK

# GraphQL introspection
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
# Expected: {"data":{"__typename":"Query"}}
```

### Open GraphQL IDE:

**Recommended**: Open [Apollo Sandbox](https://studio.apollographql.com/sandbox/explorer) and connect to `http://localhost:4200/graphql`

**Alternative**: Open http://localhost:4200/graphiql

---

## 🧪 Step 5: Test the API

### Run Unit Tests:

```bash
yarn test
```

### Manual Testing - Create a user (Signup):

```bash
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { signup(data: { email: \"test@example.com\", username: \"testuser\", password: \"password123\" }) { token user { id email } } }"
  }'
```

### Login:

```bash
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { login(data: { email: \"test@example.com\", password: \"password123\" }) { token user { id email } } }"
  }'
```

### Get current user (with auth):

```bash
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"query": "{ me { id email username } }"}'
```

---

## 📁 Step 6: Understand the Project Structure

```
src/
├── server.ts              # 🚀 Entry point - Fastify server setup
├── modules/               # 📦 Feature modules
│   ├── auth/             # Authentication (signup, login, 2FA)
│   ├── user/             # User management
│   └── upload/           # File uploads
├── config/               # ⚙️ Configuration
│   ├── prisma.ts         # Database connection & sharding
│   ├── redis.ts          # Redis connection
│   ├── authlite.ts       # Auth configuration
│   ├── tokens.ts         # Token generation
│   └── resilientRedis.ts # Redis health wrapper
├── middleware/           # 🔒 Middleware
│   ├── auth.middleware.ts    # JWT context creation
│   └── cors.middleware.ts    # CORS configuration
├── queues/               # 📨 BullMQ Queues
│   ├── connection.ts     # Queue redis connection
│   └── email.queue.ts    # Email worker
├── cache/                # 💾 Caching logic
│   ├── user.cache.ts     # User caching
│   └── refreshToken.cache.ts # Refresh token storage
├── errors/               # ❌ Error handling
│   ├── index.ts          # Error codes
│   └── errorPlugin.ts    # Mercurius error formatter
├── guards/               # 🛡️ Auth guards
│   └── auth.guard.ts     # Authentication check
├── graphql/              # 📊 GraphQL utilities
│   ├── base.graphql      # Base schema
│   └── scalars.ts        # Custom scalars
└── types/                # 📝 TypeScript types
    ├── context.type.ts   # Request context type
    └── typeDefs.generated.ts  # Generated schema
```

---

## 🔄 Step 7: Development Workflow

### Adding a new feature:

1. **Create schema**: Add `.graphql` file in `src/modules/<feature>/graphql/`
2. **Generate types**: Run `yarn generate`
3. **Implement resolver**: Add resolver in `src/modules/<feature>/resolvers/`
4. **Export resolver**: Update `src/modules/index.ts`
5. **Test**: Use Apollo Sandbox to test your queries

### Making changes:

The server has hot-reload enabled. Save any file and the server will restart automatically.

### Database changes:

```bash
# Update prisma/schema.prisma, then:
yarn db:update       # Apply to all shards
```

---

## 🐞 Common Issues

### "Redis connection error"

Redis is not running. Start it:

```bash
redis-server
```

### "getaddrinfo ENOTFOUND postgres"

PostgreSQL is not accessible. Check connection URL in `.env`.

### "Port 4200 already in use"

Kill existing process:

```bash
lsof -i :4200
kill -9 <PID>
```

### "MFA_ENCRYPTION_KEY required"

Set a 32-character key in `.env`:

```
MFA_ENCRYPTION_KEY=your-32-character-encryption-key!
```

---

## 📚 Next Steps

- Read [GraphQL API Guide](graphql-guide.md) for API usage details
- Read [Docker Guide](docker.md) for container deployment
- Read [Sharding Design](system-design-sharding.md) for database architecture
