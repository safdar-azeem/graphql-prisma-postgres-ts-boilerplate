import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserType } from '@/generated/prisma/client'
import { ShardUnavailableError } from 'prisma-sharding'
import { createContext } from './auth.middleware'
import { cache } from '@/cache'
import { verifyAccessToken } from '@/config/tokens'
import { sharding } from '@/config/sharding'

vi.mock('@/cache', () => ({
  cache: { getUser: vi.fn() },
}))

vi.mock('@/config/tokens', () => ({
  verifyAccessToken: vi.fn(),
}))

vi.mock('@/config/sharding', () => ({
  sharding: { resolveShard: vi.fn() },
}))

describe('authentication context shard routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves a managed user through the owner routing key', async () => {
    const user = {
      id: 'employee-1',
      ownerId: 'owner-1',
      userType: UserType.EMPLOYEE,
      customPermissions: [],
      roles: [],
    }
    const client = { user: { findUnique: vi.fn().mockResolvedValue(user) } }

    vi.mocked(verifyAccessToken).mockReturnValue({
      _id: user.id,
      routingKey: user.ownerId,
      userType: user.userType,
    })
    vi.mocked(cache.getUser).mockResolvedValue({ user, password: 'hashed' } as any)
    vi.mocked(sharding.resolveShard).mockResolvedValue(client as any)

    const context = await createContext('Bearer token')

    expect(cache.getUser).toHaveBeenCalledWith('employee-1', 'owner-1')
    expect(sharding.resolveShard).toHaveBeenCalledWith('owner-1')
    expect(context.client).toBe(client)
    expect(context.ownerId).toBe('owner-1')
  })

  it('does not swallow canonical shard unavailability', async () => {
    const error = new ShardUnavailableError('shard_1', 'unavailable')
    vi.mocked(verifyAccessToken).mockReturnValue({
      _id: 'employee-1',
      routingKey: 'owner-1',
      userType: UserType.EMPLOYEE,
    })
    vi.mocked(cache.getUser).mockRejectedValue(error)

    await expect(createContext('Bearer token')).rejects.toBe(error)
  })

  it('rejects pre-upgrade access tokens without a routing key', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ _id: 'owner-1' } as any)

    const context = await createContext('Bearer legacy-token')

    expect(context.isAuthenticated).toBe(false)
    expect(cache.getUser).not.toHaveBeenCalled()
    expect(sharding.resolveShard).not.toHaveBeenCalled()
  })
})
