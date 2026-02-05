# Docker Setup

Fast development environment with Nginx load balancing.

## Quick Start

```bash
# 1. Install dependencies (first time only)
yarn

# 2. Start containers (builds in ~5 seconds)
yarn docker:dev

# 3. Run migrations (first time only)
yarn docker:migrate
```

**Access:** http://localhost:3001/graphql

## Commands

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `yarn docker:dev`       | Start dev environment (3 replicas) |
| `yarn docker:dev:scale` | Start with 5 app replicas          |
| `yarn docker:migrate`   | Run database migrations            |
| `yarn docker:down`      | Stop containers                    |
| `yarn docker:clean`     | Stop + remove volumes              |
| `yarn docker:logs`      | View all logs                      |
| `yarn docker:sh`        | Shell into app container           |

## Architecture

```
localhost:3001 → Nginx (load balancer)
                    ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
      App 1      App 2      App 3
        ↓          ↓          ↓
    ┌───┴──────────┴──────────┴───┐
    ↓                             ↓
  Redis                      PostgreSQL
                          (shards 1,2,3)
```

## Key Features

- **IP-hash sticky sessions** - Same user → same app instance
- **Hot reload** with nodemon in development
- **Fast builds** - Uses host node_modules (~5s startup)
- **Easy scaling** - Just use `docker:dev:scale`

## Production

```bash
yarn docker:prod
```

Uses `Dockerfile` (multi-stage) instead of `Dockerfile.dev`.
