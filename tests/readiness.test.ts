import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.fn()
const getHealth = vi.fn()
const connect = vi.fn()
const isConnected = vi.fn(() => true)

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor() {}
  },
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    $queryRaw = queryRaw
    $disconnect = vi.fn()
  },
}))

vi.mock('prisma-sharding', () => {
  class PrismaSharding {
    connect = connect
    disconnect = vi.fn()
    isConnected = isConnected
    getHealth = getHealth
    getShard = vi.fn()
    getShardWithInfo = vi.fn()
    getShardById = vi.fn()
    findFirst = vi.fn()
  }
  return { PrismaSharding }
})

describe('checkDatabaseReady', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test'
    vi.resetModules()
    queryRaw.mockReset()
    getHealth.mockReset()
    connect.mockReset()
    isConnected.mockReset()
    isConnected.mockReturnValue(true)
  })

  it('sets defaultOk from control-plane SELECT 1, not any healthy shard', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }])
    getHealth.mockReturnValue([{ shardId: 'shard_2', isHealthy: true }])

    const { checkDatabaseReady } = await import('@/config/prisma')

    const ready = await checkDatabaseReady()
    expect(ready.defaultOk).toBe(true)
    expect(ready.ready).toBe(true)
    expect(queryRaw).toHaveBeenCalled()

    queryRaw.mockRejectedValue(new Error('control down'))
    getHealth.mockReturnValue([{ shardId: 'shard_2', isHealthy: true }])

    const notReady = await checkDatabaseReady()
    expect(notReady.defaultOk).toBe(false)
    expect(notReady.ready).toBe(false)
  })
})
