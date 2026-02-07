# Database Sharding System Design

## Overview

This document describes the horizontal database sharding implementation for our GraphQL API. The system distributes user data across multiple PostgreSQL instances (shards) to achieve:

- **Horizontal Scalability**: Add more shards as data grows
- **High Availability**: Individual shard failures don't bring down the entire system
- **Performance**: Reduced query load per database instance
- **Geographic Distribution**: Future capability to place shards closer to users

### Key Characteristics

| Attribute           | Value                                               |
| ------------------- | --------------------------------------------------- |
| Shard Key           | `user_id`                                           |
| Routing Algorithm   | Modulo hash (configurable to consistent hashing)    |
| Connection Pooling  | Per-shard with configurable pool size               |
| Health Monitoring   | Circuit breaker pattern with configurable threshold |
| Cross-Shard Queries | Parallel execution with `Promise.all()`             |

---

## Why Sharding?

### Problem Statement

As user base grows, a single PostgreSQL database becomes a bottleneck:

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE DATABASE                          │
│                                                             │
│  • 10M+ users in one table                                  │
│  • Query latency increases                                  │
│  • Write contention                                         │
│  • Backup/restore takes hours                               │
│  • Vertical scaling has limits                              │
│  • Single point of failure                                  │
└─────────────────────────────────────────────────────────────┘
```

### Solution: Horizontal Sharding

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    SHARD 1      │  │    SHARD 2      │  │    SHARD 3      │
│                 │  │                 │  │                 │
│  ~3.3M users    │  │  ~3.3M users    │  │  ~3.3M users    │
│  Lower latency  │  │  Lower latency  │  │  Lower latency  │
│  Independent    │  │  Independent    │  │  Independent    │
│  backup/restore │  │  backup/restore │  │  backup/restore │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Trade-offs

| Pros                    | Cons                                |
| ----------------------- | ----------------------------------- |
| Linear scalability      | Cross-shard queries are slower      |
| Better fault isolation  | Added complexity                    |
| Smaller backup windows  | Schema changes require coordination |
| Higher write throughput | Joins across shards not possible    |

---

## Architecture

### High-Level Architecture

```
                                    ┌─────────────────────┐
                                    │   GraphQL Client    │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │   Apollo Server     │
                                    │   (GraphQL API)     │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
           ┌────────▼────────┐      ┌──────────▼──────────┐    ┌─────────▼─────────┐
           │  Shard Router   │      │    Redis Cache      │    │   Auth Resolvers  │
           │                 │      │   (User Cache)      │    │                   │
           └────────┬────────┘      └─────────────────────┘    └───────────────────┘
                    │
           ┌────────▼────────┐
           │  Shard Manager  │
           │                 │
           │ • Connection    │
           │   Pools         │
           │ • Health Checks │
           │ • Circuit       │
           │   Breaker       │
           └────────┬────────┘
                    │
     ┌──────────────┼──────────────┬──────────────┐
     │              │              │              │
┌────▼────┐   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ Shard 1 │   │  Shard 2  │  │  Shard 3  │  │  Shard N  │
│  (PG)   │   │   (PG)    │  │   (PG)    │  │   (PG)    │
└─────────┘   └───────────┘  └───────────┘  └───────────┘
```
