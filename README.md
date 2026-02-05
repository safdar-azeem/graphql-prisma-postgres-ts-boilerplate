# GraphQL, Prisma, Postgres, TypeScript, Boilerplate

## 🚀 Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/) (v20+ recommended)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Framework**: [Express 5](https://expressjs.com/en/5x/api.html)
- **API**: [Apollo Server](https://www.apollographql.com/docs/apollo-server/) (GraphQL)
- **Database ORM**: [Prisma](https://www.prisma.io/)
- **Sharding**: [Prisma Sharding](https://github.com/safdar-azeem/prisma-sharding)
- **Database**: PostgreSQL
- **Authentication**: [AuthLite](https://github.com/safdar-azeem/authlite)
- **Code Generation**: [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v20 or higher)
- Yarn or NPM
- PostgreSQL running locally or accessible via URL
- Redis running locally

## 🏃 Getting Started

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd graphql-prisma-postgres-ts-boilerplate
    ```

2.  **Install dependencies:**

    ```bash
    yarn install
    # or
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory. You can copy the structure below:

    ```env
    DATABASE_URL="postgresql://postgres:password@localhost:5432/test?schema=public"
    JWT_SECRET="secret"
    MFA_ENCRYPTION_KEY="A9f3K2mQ7Xc8RZL4pWJ6N0H5sD1EYTUb"

    # Shard Configuration
    SHARD_COUNT=3
    SHARD_1_URL="postgresql://postgres:password@localhost:5432/shard1?schema=public"
    SHARD_2_URL="postgresql://postgres:password@localhost:5432/shard2?schema=public"
    SHARD_3_URL="postgresql://postgres:password@localhost:5432/shard3?schema=public"

    # Shard Pool Settings
    SHARD_POOL_SIZE=10
    SHARD_IDLE_TIMEOUT_MS=10000
    SHARD_CONNECTION_TIMEOUT_MS=5000
    SHARD_HEALTH_CHECK_INTERVAL_MS=30000
    SHARD_CIRCUIT_BREAKER_THRESHOLD=3

    # Routing Strategy: 'modulo' or 'consistent-hash'
    SHARD_ROUTING_STRATEGY=modulo

    REDIS_HOST=localhost
    REDIS_PORT=6379
    ```

4.  **Database & Shard Setup:**

    This project uses `prisma-sharding` to distribute data across multiple PostgreSQL instances.

    **Migrate all shards:**

    ```bash
    yarn migrate:shards
    ```

5.  **Start the Server:**
    ```bash
    yarn dev
    ```
    This command will:
    - Generate TypeScript types from GraphQL schema.
    - Start the server in watch mode (using `nodemon`).
    - The server will be available at `http://localhost:4000/graphql`.

## 🗄️ Database Sharding

This boilerplate comes with built-in sharding support using `prisma-sharding`.

### CLI Tools

We provide custom CLI tools to manage distributed databases:

| Command               | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `yarn migrate:shards` | Runs `prisma db push` on all configured shards sequentially.             |
| `yarn db:studio:all`  | Opens Prisma Studio for ALL shards on different ports (5555, 5556, etc). |
| `yarn test:shards`    | Runs a connection and distribution test across all shards.               |

### Accessing Shards in Code

**Get a shard for a specific user:**

```typescript
import { getShardForUser } from '@/config/prisma'

const client = getShardForUser(userId)
const user = await client.user.findUnique({ where: { id: userId } })
```

**Find a user across ALL shards (when ID is unknown):**

```typescript
import { findUserAcrossShards } from '@/config/prisma'

const { result } = await findUserAcrossShards(async (client) =>
  client.user.findFirst({ where: { email: 'user@example.com' } })
)
```

**Run a query on ALL shards:**

```typescript
import { sharding } from '@/config/prisma'

// Example: Count total users across all shards
const counts = await sharding.runOnAll(async (client) => client.user.count())
const totalUsers = counts.reduce((a, b) => a + b, 0)
```

## 📂 Project Structure

This project follows a **Feature-Based Modular Architecture**.

- **`src/modules/`**: Contains core features (e.g., `auth`, `user`). Each module is self-contained.
  - `src/modules/<module-name>/`: Root of the module.
  - `graphql/`: Module-specific schema (`*.graphql`).
  - `resolvers/`: Business logic (`*.resolver.ts`).
  - `utils/`: Module-specific utilities.
  - `types/`: Module-specific types (e.g., `db.types.ts`).
  - `index.ts`: Exports for the module aggregator.
- **`src/config/`**: Configuration files (Prisma, AuthLite).
- **`src/errors/`**: Error handling classes and plugins.
- **`src/guards/`**: Authentication guards (`requireAuth`).
- **`src/middleware/`**: Middleware (e.g., `auth`, `cors`).
- **`src/utils/`**: Shared utilities (e.g., email).
- **`src/constants/`**: Global constants.
- **`src/types/`**: Global type definitions.
- **`src/server.ts`**: Main entry point that sets up Apollo Server.

## 👩‍💻 Development Workflow

### Adding a New Module

1.  **Create Module Directory**:
    Create a new folder in `src/modules/<your-feature>`.
    Inside it, create `graphql/`, `resolvers/`, `utils/`, and `types/` folders.

2.  **Define Schema**:
    Add `src/modules/<your-feature>/graphql/<your-feature>.graphql`.

3.  **Implement Resolver**:
    Create `src/modules/<your-feature>/resolvers/<your-feature>.resolver.ts`.

4.  **Export Module**:
    Create `src/modules/<your-feature>/index.ts` and export your resolvers.

5.  **Register Module**:
    Import and merge your module in `src/modules/index.ts`.

6.  **Generate Types**:
    Run `npm run generate` to update TypeScript definitions.

7.  **Test**:
    Go to `http://localhost:4000/graphql` to verify your changes.

## 🗄️ Database Management

### Making Schema Changes

1.  **Modify Schema**:
    Update `prisma/schema.prisma`.

2.  **Sync Database**:
    ```bash
    yarn migrate:shards
    ```

## 🐛 Troubleshooting

- **Server exits immediately?**
  Ensure required env vars like `MFA_ENCRYPTION_KEY` are set.

- **Address in use (EADDRINUSE)?**
  Another process is using port 4000. Kill it with `kill -9 <PID>`.
