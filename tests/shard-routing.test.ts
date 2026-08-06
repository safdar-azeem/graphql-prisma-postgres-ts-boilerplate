import { describe, it, expect, vi } from 'vitest'

vi.mock('prisma-sharding', () => {
  class PrismaSharding {
    connect = vi.fn()
    disconnect = vi.fn()
    isConnected = vi.fn(() => true)
    getHealth = vi.fn(() => [])
    getShard = vi.fn()
    getShardWithInfo = vi.fn(() => ({ client: {}, shardId: 'shard_1' }))
    getShardById = vi.fn((id: string) => {
      if (id === 'missing') throw new Error('not found')
      return { id }
    })
    findFirst = vi.fn()
  }
  return { PrismaSharding }
})

describe('getDbForWorkspace', () => {
  it('never falls back when a persisted shardId is invalid', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test'
    vi.resetModules()

    // Import error class from the same module graph as the implementation
    const { getDbForWorkspace } = await import('@/config/prisma')
    const { DependencyUnavailableError } = await import('@/errors')

    try {
      getDbForWorkspace({ workspaceId: 'ws-1', shardId: 'missing' })
      expect.fail('Expected getDbForWorkspace to throw')
    } catch (error: any) {
      expect(error).toBeInstanceOf(DependencyUnavailableError)
      expect(error.extensions?.code).toBe('DEPENDENCY_UNAVAILABLE')
      expect(error.extensions?.shardId).toBe('missing')
      expect(error.extensions?.workspaceId).toBe('ws-1')
    }
  })
})
