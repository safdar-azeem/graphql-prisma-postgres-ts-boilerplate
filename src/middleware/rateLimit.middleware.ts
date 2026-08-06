import { RateLimitPluginOptions } from '@fastify/rate-limit'
import { redis, isRedisHealthy } from '@/config/redis'
import { IS_PRODUCTION } from '@/constants'
import { verifyAccessToken } from '@/config/tokens'

/**
 * Hybrid rate limiting:
 * - Authenticated (verified JWT): higher limit
 * - Anonymous / invalid token: IP-based lower limit
 *
 * Never trusts unverified jwt.decode for privileged buckets.
 */

const LIMITS = {
  AUTHENTICATED: IS_PRODUCTION ? 1000 : 5000,
  ANONYMOUS: IS_PRODUCTION ? 60 : 300,
  WINDOW_MS: 60 * 1000,
}

export const getRateLimitOptions = (): RateLimitPluginOptions => {
  const isHealthy = isRedisHealthy()

  if (!isHealthy) {
    console.warn('[RateLimit] Redis unhealthy, falling back to in-memory store')
  }

  return {
    timeWindow: LIMITS.WINDOW_MS,
    redis: isHealthy ? redis : undefined,
    allowList: ['/health', '/health/live', '/health/ready', '/'],
    nameSpace: 'api-rate-limit',

    max: (_req, key) => {
      if (key.startsWith('user:')) {
        return LIMITS.AUTHENTICATED
      }
      return LIMITS.ANONYMOUS
    },

    keyGenerator: (request) => {
      const authHeader = request.headers.authorization || (request.headers.token as string)

      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '')
          const decoded = verifyAccessToken(token)
          if (decoded?._id && !decoded.is2faPending) {
            return `user:${decoded._id}`
          }
        } catch {
          // fall through to IP
        }
      }

      return `ip:${request.ip || '127.0.0.1'}`
    },

    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      extensions: {
        code: 'RATE_LIMITED',
        retryAfter: context.after,
        limit: context.max,
        remaining: 0,
      },
    }),

    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },

    skipOnError: true,
  }
}
