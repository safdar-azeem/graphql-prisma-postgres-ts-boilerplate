import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRateLimitOptions } from '@/middleware/rateLimit.middleware'
import jwt from 'jsonwebtoken'
import { ACCESS_TOKEN_SECRET, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '@/constants'

vi.mock('@/config/redis', () => ({
  redis: { call: vi.fn() },
  isRedisHealthy: vi.fn(() => true),
}))

vi.mock('@/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    IS_PRODUCTION: true,
  }
})

describe('Rate Limit Middleware', () => {
  let options: any

  beforeEach(() => {
    options = getRateLimitOptions()
  })

  describe('keyGenerator', () => {
    it('should generate a user-based key for a verified JWT', () => {
      const userId = 'user-123'
      const token = jwt.sign({ _id: userId, tokenType: 'access' }, ACCESS_TOKEN_SECRET, {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      })
      const key = options.keyGenerator({
        headers: { authorization: `Bearer ${token}` },
        ip: '192.168.1.1',
      })
      expect(key).toBe(`user:${userId}`)
    })

    it('should fall back to IP for an unverified forged JWT', () => {
      const token = jwt.sign({ _id: 'attacker' }, 'wrong-secret')
      const key = options.keyGenerator({
        headers: { authorization: `Bearer ${token}` },
        ip: '192.168.1.1',
      })
      expect(key).toBe('ip:192.168.1.1')
    })

    it('should fall back to IP-based key for missing token', () => {
      const key = options.keyGenerator({ headers: {}, ip: '10.0.0.1' })
      expect(key).toBe('ip:10.0.0.1')
    })
  })

  describe('max', () => {
    it('returns authenticated and anonymous limits', () => {
      expect(options.max({}, 'user:123')).toBe(1000)
      expect(options.max({}, 'ip:1.1.1.1')).toBe(60)
    })
  })

  describe('errorResponseBuilder', () => {
    it('returns RATE_LIMITED code', () => {
      const response = options.errorResponseBuilder(
        {},
        { ttl: 45000, after: '45', max: 60 }
      )
      expect(response.extensions.code).toBe('RATE_LIMITED')
    })
  })
})
