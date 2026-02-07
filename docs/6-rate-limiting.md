# Rate Limiting & Security

The API implements a robust, distributed rate-limiting strategy inspired by industry standards (Google, GitHub) to ensure stability and prevent abuse.

## 🛡️ Strategy

We use a **Hybrid Rate Limiting** approach powered by **Redis**.

### 1. Authenticated Users (User-Based)
* **Key**: `user:{userId}`
* **Limit**: 1000 requests per minute
* **Behavior**: Limits follow the user across different devices and IP addresses. This prevents a single user from exhausting resources even if they rotate IPs.

### 2. Anonymous / Public (IP-Based)
* **Key**: `ip:{ipAddress}`
* **Limit**: 60 requests per minute
* **Behavior**: Applies to login, signup, and public endpoints. Stricter limits prevent brute-force attacks and scraping.

---

## 🏗️ Implementation

The implementation is located in `src/middleware/rateLimit.middleware.ts`.

### Technology Stack
* **Fastify Rate Limit**: High-performance plugin logic.
* **Redis**: Distributed state store. This allows the rate limit to work correctly even when the API is scaled across multiple Docker containers or VPS instances.

### Key Logic
The `keyGenerator` function intelligently determines the context:
1.  Checks for `Authorization` header.
2.  If a valid JWT structure is found, it extracts the `_id` (User ID).
3.  If no token or invalid token, it falls back to `X-Real-IP` (from Nginx) or the socket IP.

### Headers
The API responds with standard rate-limit headers:

```http
x-ratelimit-limit: 1000
x-ratelimit-remaining: 998
x-ratelimit-reset: 60
retry-after: 30

```

---

## 🧪 Testing

Unit tests for the rate limiting logic (key generation and limit resolution) can be found in `src/middleware/rateLimit.middleware.test.ts`.

To run the tests:

```bash
yarn test src/middleware/rateLimit.middleware.test.ts

```

## ⚙️ Configuration

Limits are defined in `src/middleware/rateLimit.middleware.ts` and adapt based on `NODE_ENV`.

| Environment | Authenticated Limit | Anonymous Limit |
|Data Type| Limit (req/min) | Limit (req/min) |
|---|---|---|
| Development | 5000 | 300 |
| Production | 1000 | 60 |

