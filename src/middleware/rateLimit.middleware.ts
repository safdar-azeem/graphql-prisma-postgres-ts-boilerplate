import { RateLimitPluginOptions } from '@fastify/rate-limit'
import { redis } from '@/config/redis'
import { IS_PRODUCTION, JWT_SECRET } from '@/constants'
import jwt from 'jsonwebtoken'

/**
 * Rate Limit Configurations
 */
const LIMITS = {
  // Authenticated users get a high limit (standard usage)
  AUTHENTICATED: IS_PRODUCTION ? 1000 : 5000,
  // Anonymous IPs get a lower limit (prevents login spam/DDoS)
  ANONYMOUS: IS_PRODUCTION ? 60 : 300,
  // Time window in milliseconds (1 minute)
  WINDOW_MS: 60 * 1000,
}

/**
 * Configure Hybrid Rate Limiting
 * Strategy:
 * 1. If valid JWT found -> Limit by User ID (High Limit)
 * 2. If no/invalid JWT -> Limit by IP Address (Low Limit)
 */
export const getRateLimitOptions = (): RateLimitPluginOptions => ({
  timeWindow: LIMITS.WINDOW_MS,
  redis: redis,
  allowList: ['/health', '/'],

  // Dynamic limit based on the generated key prefix
  max: (req, key) => {
    if (key.startsWith('user:')) {
      return LIMITS.AUTHENTICATED
    }
    return LIMITS.ANONYMOUS
  },

  // Hybrid Key Generator
  keyGenerator: (request) => {
    const authHeader = request.headers.authorization || (request.headers.token as string)

    // 1. Attempt to identify by User ID
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        // We decode locally here for speed - verifying signature is enough for rate limiting context
        const decoded = jwt.verify(token, JWT_SECRET) as { _id: string }
        
        if (decoded?._id) {
          return `user:${decoded._id}`
        }
      } catch (err) {
        // Token expired or invalid? Fallback to IP limiting
      }
    }

    // 2. Fallback to IP Address (for Login/Signup/Anonymous)
    const clientIp = (request.headers['x-real-ip'] as string) || request.ip
    return `ip:${clientIp}`
  },

  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Please try again in ${context.after}`,
  }),

  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
})
