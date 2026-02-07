import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRateLimitOptions } from '@/middleware/rateLimit.middleware'
import jwt from 'jsonwebtoken'

// Mock dependencies
vi.mock('@/config/redis', () => ({
  redis: {
    // Minimal mock for Redis client
    call: vi.fn(),
  },
}))

vi.mock('@/constants', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    // Ensure consistent environment for testing limits
    IS_PRODUCTION: true, 
  }
})

describe('Rate Limit Middleware', () => {
  let options: any
  
  beforeEach(() => {
    options = getRateLimitOptions()
  })

  describe('keyGenerator', () => {
    it('should generate a user-based key for valid JWT', () => {
      // GIVEN
      const userId = 'user-123'
      const token = jwt.sign({ _id: userId }, 'secret') // Signed with dummy secret, decoding doesn't verify signature
      const request = {
        headers: {
          authorization: `Bearer ${token}`,
        },
        ip: '192.168.1.1',
      }

      // WHEN
      const key = options.keyGenerator(request)

      // THEN
      expect(key).toBe(`user:${userId}`)
    })

    it('should fall back to IP-based key for missing token', () => {
      // GIVEN
      const ip = '10.0.0.1'
      const request = {
        headers: {},
        ip: ip,
      }

      // WHEN
      const key = options.keyGenerator(request)

      // THEN
      expect(key).toBe(`ip:${ip}`)
    })

    it('should fall back to IP-based key for malformed token', () => {
      // GIVEN
      const ip = '10.0.0.2'
      const request = {
        headers: {
          authorization: 'Bearer malformed.token.here',
        },
        ip: ip,
      }

      // WHEN
      const key = options.keyGenerator(request)

      // THEN
      expect(key).toBe(`ip:${ip}`)
    })

    it('should prefer x-real-ip header if present', () => {
      // GIVEN
      const realIp = '203.0.113.1'
      const request = {
        headers: {
          'x-real-ip': realIp,
        },
        ip: '127.0.0.1', // Local proxy IP
      }

      // WHEN
      const key = options.keyGenerator(request)

      // THEN
      expect(key).toBe(`ip:${realIp}`)
    })
  })

  describe('max (Limit Resolver)', () => {
    it('should return AUTHENTICATED limit for user keys', () => {
      // GIVEN
      const key = 'user:123'
      
      // WHEN
      const limit = options.max({}, key)

      // THEN
      // Based on IS_PRODUCTION: true mock above
      expect(limit).toBe(1000) 
    })

    it('should return ANONYMOUS limit for ip keys', () => {
      // GIVEN
      const key = 'ip:192.168.1.1'
      
      // WHEN
      const limit = options.max({}, key)

      // THEN
      expect(limit).toBe(60) 
    })
  })

  describe('errorResponseBuilder', () => {
    it('should return correct 429 structure', () => {
      // GIVEN
      const context = {
        ttl: 45000,
        after: '45',
        max: 60,
      }

      // WHEN
      const response = options.errorResponseBuilder({}, context)

      // THEN
      expect(response).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.stringContaining('try again in 45 seconds'),
        extensions: {
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: '45',
          limit: 60,
          remaining: 0
        }
      })
    })
  })
})

