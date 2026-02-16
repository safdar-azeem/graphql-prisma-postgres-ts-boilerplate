# GraphQL API Guide

Complete guide to using and testing the GraphQL API powered by Fastify + Mercurius.

---

## 🌐 Endpoints

| Endpoint    | Method | Description           |
| ----------- | ------ | --------------------- |
| `/graphql`  | POST   | GraphQL API endpoint  |
| `/graphiql` | GET    | Built-in GraphiQL IDE |
| `/health`   | GET    | Health check          |
| `/`         | GET .  | Server info           |

---

## 🧪 Testing Tools

### 1. Automated Unit Tests (Vitest)

Run the comprehensive test suite for resolvers and business logic:

```bash
yarn test
```

This uses a custom reporter to show a clean summary of passed/failed actions.

### 2. Apollo Sandbox (⭐ Recommended for Manual Testing)

The best GraphQL IDE experience with full features:

1. Open: https://studio.apollographql.com/sandbox/explorer
2. Enter endpoint: `http://localhost:4200/graphql`
3. Start querying!

**Features:**

- Schema explorer with documentation
- Auto-complete for queries
- Query history
- Multiple tabs
- Environment variables
- Response visualization

### 2. Altair GraphQL Client

Desktop application with advanced features:

- Download: https://altairgraphql.dev/
- Available for Windows, macOS, Linux, Chrome, Firefox

**Features:**

- Pre/post request scripts
- Environment management
- Import/export collections
- Works offline
- File uploads support

### 3. Built-in GraphiQL

Simple browser-based IDE:

- Open: http://localhost:4200/graphiql

**Note:** Basic functionality, use Apollo Sandbox for better experience.

### 4. cURL / Terminal

For quick testing or CI/CD:

```bash
curl -X POST http://localhost:4200/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR_QUERY_HERE"}'
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "data": null,
  "errors": [
    {
      "message": "Error description",
      "extensions": {
        "code": "ERROR_CODE"
      },
      "path": ["fieldName"]
    }
  ]
}
```

### Common Error Codes

| Code                    | Description              |
| ----------------------- | ------------------------ |
| `UNAUTHENTICATED`       | Missing or invalid token |
| `FORBIDDEN`             | Insufficient permissions |
| `BAD_USER_INPUT`        | Invalid input data       |
| `NOT_FOUND`             | Resource not found       |
| `INTERNAL_SERVER_ERROR` | Server error             |

---
