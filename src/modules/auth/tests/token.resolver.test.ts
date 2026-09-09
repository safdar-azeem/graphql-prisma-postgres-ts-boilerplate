import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenResolver } from '../resolvers/token.resolver'
import { verifyRefreshToken, generateTokenPair } from '@/config/tokens'
import {
  isRefreshTokenValid,
  revokeRefreshToken,
  storeRefreshToken,
} from '@/cache/refreshToken.cache'
import { sharding } from '@/config/sharding'
import { AuthenticationError } from '@/errors'

vi.mock('@/config/tokens', () => ({
  verifyRefreshToken: vi.fn(),
  generateTokenPair: vi.fn(),
}))

vi.mock('@/cache/refreshToken.cache', () => ({
  isRefreshTokenValid: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
  storeRefreshToken: vi.fn(),
}))

vi.mock('@/config/sharding', () => ({
  sharding: { resolveShard: vi.fn() },
}))

vi.mock('@/guards', () => ({
  requireAuth: (resolver: unknown) => resolver,
}))

describe('refresh-token shard routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves a managed user through the routing key in the refresh token', async () => {
    const user = {
      id: 'employee-1',
      ownerId: 'owner-1',
      email: 'employee@example.com',
      userType: 'EMPLOYEE',
    }
    const client = { user: { findUnique: vi.fn().mockResolvedValue(user) } }

    vi.mocked(verifyRefreshToken).mockReturnValue({
      jti: 'old-jti',
      sub: user.id,
      routingKey: user.ownerId,
    })
    vi.mocked(isRefreshTokenValid).mockResolvedValue(true)
    vi.mocked(sharding.resolveShard).mockResolvedValue(client as any)
    vi.mocked(generateTokenPair).mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      jti: 'new-jti',
    })

    await (tokenResolver.Mutation?.refreshTokens as any)(
      {},
      { refreshToken: 'refresh-token' },
      {},
      {}
    )

    expect(revokeRefreshToken).toHaveBeenCalledWith('employee-1', 'old-jti')
    expect(sharding.resolveShard).toHaveBeenCalledWith('owner-1')
    expect(client.user.findUnique).toHaveBeenCalledWith({ where: { id: 'employee-1' } })
    expect(storeRefreshToken).toHaveBeenCalledWith('employee-1', 'new-jti')
  })

  it('rejects pre-upgrade refresh tokens without a routing key', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue({
      jti: 'legacy-jti',
      sub: 'owner-1',
    } as any)

    await expect(
      (tokenResolver.Mutation?.refreshTokens as any)(
        {},
        { refreshToken: 'legacy-refresh-token' },
        {},
        {}
      )
    ).rejects.toThrow(AuthenticationError)

    expect(isRefreshTokenValid).not.toHaveBeenCalled()
    expect(sharding.resolveShard).not.toHaveBeenCalled()
  })
})
