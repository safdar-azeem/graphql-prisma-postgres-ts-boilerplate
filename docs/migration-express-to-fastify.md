# Migration from Express to Fastify

This document explains the architectural migration from Express + Apollo Server to Fastify + Mercurius and provides comparison benchmarks.

---

## 📊 Stack Comparison

| Component       | Before                   | After                |
| --------------- | ------------------------ | -------------------- |
| HTTP Framework  | Express 5.2.1            | Fastify 5.3.0        |
| GraphQL Server  | Apollo Server 5.3.0      | Mercurius 16.0.3     |
| CORS            | cors + custom middleware | @fastify/cors 11.0.0 |
| Body Parsing    | body-parser              | Built-in Fastify     |
| Request Logging | console.log              | Pino (built-in)      |

---

## ⚡ Why Fastify + Mercurius?

### Performance Benefits

| Feature           | Express + Apollo | Fastify + Mercurius |
| ----------------- | ---------------- | ------------------- |
| Request routing   | Middleware chain | Radix tree router   |
| Async handling    | Callback-based   | Native async/await  |
| JSON parsing      | body-parser      | Built-in optimized  |
| Logging           | Manual           | Pino (high-perf)    |
| Schema parsing    | Per-request      | Cached              |
| Query compilation | Standard         | JIT compiled        |

### Mercurius Features

- **JIT Query Compilation**: Queries are compiled for faster execution
- **Automatic Loader Integration**: Prevents N+1 query problems
- **Query Parsing Cache**: Validated queries are cached
- **Federation Support**: Built-in Apollo Federation compatibility
- **WebSocket Subscriptions**: Native GraphQL subscriptions

### Security Improvements

| Aspect             | Express    | Fastify              |
| ------------------ | ---------- | -------------------- |
| Input validation   | Manual     | JSON Schema built-in |
| CORS               | Middleware | Plugin with defaults |
| Rate limiting      | Manual     | Plugin ecosystem     |
| Reply immutability | Mutable    | Immutable by default |

---

## 🔄 Code Changes Summary

### Server Entry Point (`server.ts`)

**Before (Express + Apollo):**

```typescript
import express from 'express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'

const app = express()
const httpServer = http.createServer(app)

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
})

await server.start()

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req }) => createContext(req),
  })
)

httpServer.listen({ port })
```

**After (Fastify + Mercurius):**

```typescript
import Fastify from 'fastify'
import mercurius from 'mercurius'
import { makeExecutableSchema } from '@graphql-tools/schema'

const app = Fastify({ logger: true })

const schema = makeExecutableSchema({ typeDefs, resolvers })

await app.register(mercurius, {
  schema,
  graphiql: true,
  path: '/graphql',
  context: (request) => createContext(request),
})

await app.listen({ port, host: '0.0.0.0' })
```

### CORS Middleware

**Before (Express middleware function):**

```typescript
export const corsMiddleware = (req, res, next) => {
  if (shouldAllowRequest(req)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    next()
  } else {
    res.status(403).json({ error: 'Not allowed' })
  }
}
```

**After (Fastify plugin options):**

```typescript
export const getCorsOptions = (): FastifyCorsOptions => ({
  origin: (origin, callback) => {
    if (shouldAllowOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed'), false)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
})
```

### Error Handling

**Before (Apollo plugin):**

```typescript
export const errorHandlingPlugin = (): ApolloServerPlugin => ({
  async requestDidStart() {
    return {
      async didEncounterErrors(ctx) {
        for (const error of ctx.errors) {
          console.error(error)
        }
      },
    }
  },
})
```

**After (Mercurius error formatter):**

```typescript
export const mercuriusFormatError = (execution: ExecutionResult, context: MercuriusContext) => {
  if (execution.errors) {
    for (const error of execution.errors) {
      context.app.log.error(error)
    }
  }
  return {
    statusCode: 200,
    response: {
      data: execution.data ?? null,
      errors: execution.errors?.map(formatSingleError),
    },
  }
}
```

---

## 📈 Benchmark Results

### Test Configuration

```bash
autocannon -c30 -d10 http://localhost:4200
# 30 connections, 10 seconds duration
```

### Express + Apollo Server

```
┌───────────┬─────────┬──────────┬─────────┐
│ Metric    │ Avg     │ Max      │ Stdev   │
├───────────┼─────────┼──────────┼─────────┤
│ Latency   │ 4.29 ms │ 61 ms    │ 2 ms    │
│ Req/Sec   │ 6,267   │ 7,719    │ 800     │
│ Bytes/Sec │ 1.69 MB │ 2.08 MB  │ 215 kB  │
└───────────┴─────────┴──────────┴─────────┘
Total: 69k requests in 11.02s
```

### Fastify + Mercurius

```
┌───────────┬─────────┬──────────┬─────────┐
│ Metric    │ Avg     │ Max      │ Stdev   │
├───────────┼─────────┼──────────┼─────────┤
│ Latency   │ 5.88 ms │ 114 ms   │ 9.71 ms │
│ Req/Sec   │ 4,711   │ 5,359    │ 735     │
│ Bytes/Sec │ 1.04 MB │ 1.18 MB  │ 162 kB  │
└───────────┴─────────┴──────────┴─────────┘
Total: 47k requests in 10.09s
```

### Analysis

> **Note:** The benchmarks hit the root HTTP endpoint, not the GraphQL endpoint. Development mode with logging enabled affects results. The real performance benefits of Mercurius appear in:
>
> - Complex GraphQL queries (JIT compilation)
> - Queries with relationships (automatic loaders)
> - High-concurrency scenarios
> - Production mode with disabled logging

---

## 🔧 Dependencies Changed

### Removed

```json
{
  "@apollo/server": "^5.3.0",
  "@as-integrations/express5": "^1.1.2",
  "express": "^5.2.1",
  "body-parser": "^2.2.2",
  "cors": "^2.8.6",
  "@types/express": "^5.0.6",
  "@types/cors": "^2.8.19"
}
```

### Added

```json
{
  "fastify": "^5.3.0",
  "mercurius": "^16.0.3",
  "@fastify/cors": "^11.0.0"
}
```

---

## 🎯 GraphQL IDE Changes

| Feature        | Apollo Server  | Mercurius              |
| -------------- | -------------- | ---------------------- |
| Built-in IDE   | Apollo Sandbox | GraphiQL               |
| IDE URL        | `/graphql`     | `/graphiql`            |
| Recommendation | Same           | Use Apollo Sandbox web |

**To get the same Apollo experience:**
Open https://studio.apollographql.com/sandbox/explorer and connect to your endpoint.

---

## 📚 References

- [Fastify Documentation](https://fastify.dev/)
- [Mercurius Documentation](https://mercurius.dev/)
- [Fastify v5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)
- [Mercurius GitHub](https://github.com/mercurius-js/mercurius)
