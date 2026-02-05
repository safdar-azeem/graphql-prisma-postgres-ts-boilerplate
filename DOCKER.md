# Docker Setup

Production-ready development environment with Nginx load balancing.

## Quick Start

```bash
# Start (first time builds ~7 min, then ~10 sec)
yarn docker:dev

# Run migrations
yarn docker:migrate
```

**Access:** http://localhost:3001/graphql

## Commands

| Command                 | Description                   |
| ----------------------- | ----------------------------- |
| `yarn docker:dev`       | Start containers (3 replicas) |
| `yarn docker:dev:scale` | Start with 5 replicas         |
| `yarn docker:migrate`   | Run database migrations       |
| `yarn docker:down`      | Stop containers               |
| `yarn docker:clean`     | Stop + remove volumes/images  |
| `yarn docker:logs`      | View all logs                 |
| `yarn docker:sh`        | Shell into app container      |

## Architecture

```
localhost:3001 → Nginx (load balancer)
                    ↓ (IP-hash sticky sessions)
        ┌──────────┼──────────┐
        ↓          ↓          ↓
      App 1      App 2      App 3
        ↓          ↓          ↓
    ┌───┴──────────┴──────────┴───┐
    ↓                             ↓
  Redis                      PostgreSQL
                          (shards 1,2,3)
```

## Features

- **IP-hash sticky sessions** - Same user → same app instance
- **Hot reload** - nodemon watches /src for changes
- **Easy scaling** - just use `docker:dev:scale`
- **3 database shards** - auto-created on first run

## Production

```bash
yarn docker:prod
```

Uses full multi-stage `Dockerfile` for optimized production image.
