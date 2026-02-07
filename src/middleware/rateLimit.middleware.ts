import { RateLimitPluginOptions } from '@fastify/rate-limit'
import { redis } from '@/config/redis'
import { IS_PRODUCTION, JWT_SECRET } from '@/constants'
import jwt from 'jsonwebtoken'

/**
 * Rate Limit Strategy & Configuration
 * ---------------------------------
 * We implement a hybrid rate limiting strategy similar to major platforms (GitHub, Twitter):
 *
 * 1. Authenticated Users (User-ID based):
 * - Higher limits (e.g., 1000 req/min)
 * - Rate limits follow the user regardless of IP/Device
 *
 * 2. Unauthenticated Users (IP based):
 * - Lower limits (e.g., 60 req/min)
 * - Protects against brute-force, scraping, and DDoS
 *
 * Infrastructure:
 * - Uses Redis for distributed counter state (works across multiple server instances)
 * - Uses Fastify's trustProxy to correctly identify client IP behind Nginx/LoadBalancers
 */

const LIMITS = {
  // Authenticated: 1000 req/min (Standard API usage)
  AUTHENTICATED: IS_PRODUCTION ? 1000 : 5000,
  // Anonymous: 60 req/min (Login/Signup/Public strictness)
  ANONYMOUS: IS_PRODUCTION ? 60 : 300,
  // Window: 1 minute
  WINDOW_MS: 60 * 1000,
}

interface DecodedToken {
  _id: string
  iat?: number
  exp?: number
}

export const getRateLimitOptions = (): RateLimitPluginOptions => ({
  timeWindow: LIMITS.WINDOW_MS,
  redis: redis,
  // Whitelist health checks and root to prevent internal monitoring issues
  allowList: ['/health', '/'],
  
  // Use a custom name to identify this limiter in headers
  nameSpace: 'api-rate-limit',

  /**
   * Dynamic Limit Resolver
   * Returns the max requests allowed based on the key prefix.
   */
  max: (req, key) => {
    if (key.startsWith('user:')) {
      return LIMITS.AUTHENTICATED
    }
    return LIMITS.ANONYMOUS
  },

  /**
   * Hybrid Key Generator
   * Determines if the request is from a User or an IP.
   */
  keyGenerator: (request) => {
    const authHeader = request.headers.authorization || (request.headers.token as string)

    // 1. Authenticated User Strategy
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        
        // We decode locally without verification for speed in the rate-limit phase.
        // The actual AuthGuard will verify validity later. 
        // If the token is garbage, this fails and falls back to IP.
        const decoded = jwt.decode(token) as DecodedToken | null
        
        if (decoded?._id) {
          return `user:${decoded._id}`
        }
      } catch (err) {
        // Token parsing failed; treat as anonymous
      }
    }

    // 2. IP Fallback Strategy
    // fastify.trustProxy must be true for this to work behind Nginx
    const clientIp = (request.headers['x-real-ip'] as string) || request.ip || '127.0.0.1'
    return `ip:${clientIp}`
  },

  /**
   * Custom Error Response (RFC 7807 compliant structure)
   */
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    extensions: {
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: context.after,
      limit: context.max,
      remaining: 0
    }
  }),

  // Expose standard RateLimit headers
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
})

