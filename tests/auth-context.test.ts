import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createContext } from '@/middleware/auth.middleware'
import * as TokenConfig from '@/config/tokens'
import * as Cache from '@/cache'
import * as PrismaConfig from '@/config/prisma'

vi.mock('@/config/tokens', () => ({
  verifyAccessToken: vi.fn(),
}))

vi.mock('@/cache', () => ({
  cache: {
    getUser: vi.fn(),
    setUser: vi.fn().mockResolvedValue(undefined),
    invalidateUser: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/config/prisma', () => ({
  getDbForWorkspace: vi.fn(),
  findUserAcrossShards: vi.fn(),
}))

describe('createContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Cache.cache.invalidateUser).mockResolvedValue(undefined)
    vi.mocked(Cache.cache.setUser).mockResolvedValue(undefined)
  })

  it('rejects deleted users even when cache still has them', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({
      _id: 'user-1',
      workspaceId: 'ws-1',
    } as any)
    vi.mocked(Cache.cache.getUser).mockResolvedValue({
      user: { id: 'user-1', workspaceId: 'ws-1', status: 'ACTIVE' } as any,
      workspaceId: 'ws-1',
      shardId: 'shard_1',
    })
    vi.mocked(PrismaConfig.getDbForWorkspace).mockReturnValue({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any)
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: null,
      client: null,
      shardId: null,
    })

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.user).toBeNull()
    expect(Cache.cache.invalidateUser).toHaveBeenCalledWith('user-1')
  })

  it('fails closed when workspace is suspended', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({ _id: 'user-1' } as any)
    vi.mocked(Cache.cache.getUser).mockResolvedValue(null)
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'ACTIVE',
        userType: 'OWNER',
        workspaceId: 'ws-1',
        customPermissions: [],
        roles: [],
        password: 'hash',
        workspace: { id: 'ws-1', status: 'SUSPENDED', shardId: 'shard_1' },
      },
      client: {},
      shardId: 'shard_1',
    } as any)
    vi.mocked(PrismaConfig.getDbForWorkspace).mockReturnValue({} as any)

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(false)
  })

  it('fails closed when user status is missing/non-active', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({ _id: 'user-1' } as any)
    vi.mocked(Cache.cache.getUser).mockResolvedValue(null)
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'SUSPENDED',
        userType: 'MEMBER',
        workspaceId: 'ws-1',
        customPermissions: [],
        roles: [],
        password: 'hash',
        workspace: { id: 'ws-1', status: 'ACTIVE', shardId: 'shard_1' },
      },
      client: {},
      shardId: 'shard_1',
    } as any)
    vi.mocked(PrismaConfig.getDbForWorkspace).mockReturnValue({} as any)

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(false)
  })

  it('continues with DB auth when cache.getUser throws', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({
      _id: 'user-1',
      workspaceId: 'ws-1',
    } as any)
    vi.mocked(Cache.cache.getUser).mockRejectedValue(new Error('redis down'))
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'ACTIVE',
        userType: 'MEMBER',
        workspaceId: 'ws-1',
        customPermissions: [],
        roles: [],
        password: 'hash',
        workspace: { id: 'ws-1', status: 'ACTIVE', shardId: 'shard_1' },
      },
      client: {},
      shardId: 'shard_1',
    } as any)
    vi.mocked(PrismaConfig.getDbForWorkspace).mockReturnValue({} as any)

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.user?.id).toBe('user-1')
    expect(PrismaConfig.findUserAcrossShards).toHaveBeenCalled()
  })

  it('rejects deleted users when cache is unavailable', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({ _id: 'user-1' } as any)
    vi.mocked(Cache.cache.getUser).mockRejectedValue(new Error('redis down'))
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: null,
      client: null,
      shardId: null,
    })

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(false)
  })

  it('ignores incorrect cache shard hint and still authenticates via DB', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({ _id: 'user-1' } as any)
    vi.mocked(Cache.cache.getUser).mockResolvedValue({
      user: { id: 'user-1' } as any,
      workspaceId: 'ws-1',
      shardId: 'wrong-shard',
    })
    vi.mocked(PrismaConfig.getDbForWorkspace).mockImplementation((opts: any) => {
      if (opts.shardId === 'wrong-shard') {
        throw new Error('bad hint')
      }
      return {} as any
    })
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'ACTIVE',
        userType: 'MEMBER',
        workspaceId: 'ws-1',
        customPermissions: [],
        roles: [],
        password: 'hash',
        workspace: { id: 'ws-1', status: 'ACTIVE', shardId: 'shard_1' },
      },
      client: {},
      shardId: 'shard_1',
    } as any)

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(true)
    expect(Cache.cache.invalidateUser).toHaveBeenCalledWith('user-1')
  })

  it('still authenticates when cache.setUser fails after DB lookup', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue({ _id: 'user-1' } as any)
    vi.mocked(Cache.cache.getUser).mockResolvedValue(null)
    vi.mocked(Cache.cache.setUser).mockRejectedValue(new Error('redis write failed'))
    vi.mocked(PrismaConfig.findUserAcrossShards).mockResolvedValue({
      result: {
        id: 'user-1',
        status: 'ACTIVE',
        userType: 'MEMBER',
        workspaceId: 'ws-1',
        customPermissions: [],
        roles: [],
        password: 'hash',
        workspace: { id: 'ws-1', status: 'ACTIVE', shardId: 'shard_1' },
      },
      client: {},
      shardId: 'shard_1',
    } as any)
    vi.mocked(PrismaConfig.getDbForWorkspace).mockReturnValue({} as any)

    const ctx = await createContext('Bearer token')
    expect(ctx.isAuthenticated).toBe(true)
  })

  it('rejects storage-service tokens as user access tokens', async () => {
    vi.mocked(TokenConfig.verifyAccessToken).mockReturnValue(null)

    const ctx = await createContext('Bearer storage-token')
    expect(ctx.isAuthenticated).toBe(false)
    expect(Cache.cache.getUser).not.toHaveBeenCalled()
  })
})
