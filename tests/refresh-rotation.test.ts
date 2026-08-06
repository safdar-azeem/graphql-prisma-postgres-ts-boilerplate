import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthenticationError } from '@/errors'

vi.mock('@/config/redis', () => ({
  redis: {
    eval: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    expire: vi.fn(),
    sismember: vi.fn(),
  },
}))

import { redis } from '@/config/redis'
import {
  rotateRefreshToken,
  assertRotated,
  revokeAllRefreshTokens,
} from '@/cache/refreshToken.cache'

describe('refresh token rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('atomically rotates when old jti is consumed', async () => {
    vi.mocked(redis.eval).mockResolvedValue(1)
    await expect(rotateRefreshToken('user-1', 'old', 'new')).resolves.toBe('ok')
    expect(redis.eval).toHaveBeenCalled()
  })

  it('revokes all sessions on reuse', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0)
    vi.mocked(redis.del).mockResolvedValue(1)

    await expect(rotateRefreshToken('user-1', 'reused', 'new')).resolves.toBe('reuse')
    expect(redis.del).toHaveBeenCalled()
  })

  it('assertRotated throws AuthenticationError on reuse', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0)
    vi.mocked(redis.del).mockResolvedValue(1)

    await expect(assertRotated('user-1', 'reused', 'new')).rejects.toBeInstanceOf(
      AuthenticationError
    )
  })

  it('revokeAllRefreshTokens deletes the user session set', async () => {
    vi.mocked(redis.del).mockResolvedValue(1)
    await revokeAllRefreshTokens('user-1')
    expect(redis.del).toHaveBeenCalledWith('refresh:user-1')
  })
})
