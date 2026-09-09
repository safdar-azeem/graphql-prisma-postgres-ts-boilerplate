import { beforeEach, describe, expect, it, vi } from 'vitest'
import { twoFaResolvers } from '../resolvers/2fa.resolver'
import { verifyAccessToken, generateTokenPair } from '@/config/tokens'
import { sharding } from '@/config/sharding'

vi.mock('@/config/tokens', () => ({
  verifyAccessToken: vi.fn(),
  generateTokenPair: vi.fn(),
}))

vi.mock('@/config/sharding', () => ({
  sharding: { resolveShard: vi.fn() },
}))

vi.mock('@/guards', () => ({
  requireAuth: (resolver: unknown) => resolver,
}))

vi.mock('@/config/authlite', () => ({
  authLite: { mfa: { verifyTotp: vi.fn(), createEnrollment: vi.fn() } },
}))

vi.mock('@/cache', () => ({
  cache: { invalidateUser: vi.fn() },
}))

vi.mock('@/cache/refreshToken.cache', () => ({
  storeRefreshToken: vi.fn(),
}))

vi.mock('@/utils/email.util', () => ({
  sendEmail: vi.fn(),
}))

describe('2FA shard routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the owner routing key from the pending access token', async () => {
    const user = {
      id: 'employee-1',
      ownerId: 'owner-1',
      email: 'employee@example.com',
      mfaSettings: { isEnabled: false },
    }
    const client = { user: { findUnique: vi.fn().mockResolvedValue(user) } }

    vi.mocked(verifyAccessToken).mockReturnValue({
      _id: user.id,
      routingKey: user.ownerId,
      is2faPending: true,
    })
    vi.mocked(sharding.resolveShard).mockResolvedValue(client as any)
    vi.mocked(generateTokenPair).mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      jti: 'jti',
    })

    await (twoFaResolvers.Mutation?.verify2FA as any)(
      {},
      { otp: '123456', token: 'pending-token' },
      {},
      {}
    )

    expect(sharding.resolveShard).toHaveBeenCalledWith('owner-1')
    expect(client.user.findUnique).toHaveBeenCalledWith({ where: { id: 'employee-1' } })
  })
})
