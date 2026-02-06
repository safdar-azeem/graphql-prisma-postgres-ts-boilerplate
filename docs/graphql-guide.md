# GraphQL API Guide

Complete guide to using and testing the GraphQL API powered by Fastify + Mercurius.

---

## 🌐 Endpoints

| Endpoint    | Method | Description           |
| ----------- | ------ | --------------------- |
| `/graphql`  | POST   | GraphQL API endpoint  |
| `/graphiql` | GET    | Built-in GraphiQL IDE |
| `/health`   | GET    | Health check          |
| `/`         | GET    | Server info           |

---

## 🧪 Testing Tools (Best to Worst)

### 1. Apollo Sandbox (⭐ Recommended)

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

## 🔐 Authentication

All authenticated requests require a JWT token in the header:

```
Authorization: Bearer <your-jwt-token>
```

Or using the custom header:

```
token: <your-jwt-token>
```

### Get a Token

**Signup:**

```graphql
mutation {
  signup(data: { email: "user@example.com", username: "myuser", password: "securepassword123" }) {
    token
    user {
      id
      email
      username
    }
  }
}
```

**Login:**

```graphql
mutation {
  login(data: { email: "user@example.com", password: "securepassword123" }) {
    token
    user {
      id
      email
    }
  }
}
```

---

## 📝 Example Queries

### Basic Queries

**Get current user:**

```graphql
query {
  me {
    id
    email
    username
    createdAt
  }
}
```

**Get files:**

```graphql
query {
  getFiles(pagination: { limit: 10, offset: 0 }) {
    edges {
      id
      filename
      mimeType
      size
    }
    pageInfo {
      hasNextPage
      totalCount
    }
  }
}
```

### Mutations

**Create folder:**

```graphql
mutation {
  createFolder(input: { name: "My Documents", parentId: null }) {
    id
    name
    path
  }
}
```

**Request file upload URL:**

```graphql
mutation {
  requestUploadUrl(
    input: { filename: "photo.jpg", mimeType: "image/jpeg", size: 1024000, folderId: null }
  ) {
    uploadUrl
    fileId
  }
}
```

### Two-Factor Authentication

**Enable 2FA:**

```graphql
mutation {
  init2faEnrollment(method: AUTHENTICATOR) {
    secret
    qrCode
    backupCodes
  }
}
```

**Confirm 2FA:**

```graphql
mutation {
  confirm2faEnrollment(token: "123456", secret: "YOUR_SECRET")
}
```

---

## 📊 Schema Exploration

### Introspection Query

Get the full schema:

```graphql
query {
  __schema {
    types {
      name
      description
      fields {
        name
        type {
          name
        }
      }
    }
  }
}
```

### Type Details

Get details about a specific type:

```graphql
query {
  __type(name: "User") {
    name
    fields {
      name
      type {
        name
        kind
      }
    }
  }
}
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

## 🔄 Pagination

All list queries support pagination:

```graphql
query {
  getFiles(pagination: { limit: 20, offset: 0 }) {
    edges {
      id
      filename
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      totalCount
    }
  }
}
```

---

## 🧩 Custom Scalars

| Scalar     | Description         | Example                      |
| ---------- | ------------------- | ---------------------------- |
| `DateTime` | ISO 8601 date-time  | `"2024-01-15T10:30:00Z"`     |
| `JSON`     | Arbitrary JSON data | `{"key": "value"}`           |
| `ObjectId` | MongoDB-style ID    | `"507f1f77bcf86cd799439011"` |
| `Upload`   | File upload         | (multipart form)             |

---

## 🚀 Performance Tips

1. **Request only needed fields** - Don't over-fetch
2. **Use pagination** - Limit large result sets
3. **Batch queries** - Combine multiple queries in one request
4. **Use fragments** - Reuse field selections

### Batch Example

```graphql
query {
  user1: me {
    id
    email
  }
  files: getFiles(pagination: { limit: 5 }) {
    edges {
      id
      filename
    }
  }
}
```

---

## 📱 Client Integration

### JavaScript/TypeScript

```typescript
const response = await fetch('http://localhost:4200/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    query: `
      query {
        me { id email username }
      }
    `,
  }),
})

const { data, errors } = await response.json()
```

### With Apollo Client

```typescript
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client'

const client = new ApolloClient({
  link: createHttpLink({
    uri: 'http://localhost:4200/graphql',
    headers: {
      authorization: `Bearer ${token}`,
    },
  }),
  cache: new InMemoryCache(),
})
```
