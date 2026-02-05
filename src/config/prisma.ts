import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma'
import { PrismaSharding } from 'prisma-sharding'

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })

const SHARD_COUNT = parseInt(process.env.SHARD_COUNT || '1', 10)

const buildShardConfigs = () => {
  const shards = []
  for (let i = 1; i <= SHARD_COUNT; i++) {
    const url = process.env[`SHARD_${i}_URL`]
    if (url) {
      shards.push({ id: `shard_${i}`, url })
    }
  }

  if (shards.length === 0 && process.env.DATABASE_URL) {
    shards.push({ id: 'shard_1', url: process.env.DATABASE_URL })
  }

  return shards
}

export const sharding = new PrismaSharding<PrismaClient>({
  shards: buildShardConfigs(),
  strategy: (process.env.SHARD_ROUTING_STRATEGY as 'modulo' | 'consistent-hash') || 'modulo',
  createClient: (url) => {
    const shardAdapter = new PrismaPg({
      connectionString: url,
      max: parseInt(process.env.SHARD_POOL_SIZE || '10', 10),
      idleTimeoutMillis: parseInt(process.env.SHARD_IDLE_TIMEOUT_MS || '10000', 10),
      connectionTimeoutMillis: parseInt(process.env.SHARD_CONNECTION_TIMEOUT_MS || '5000', 10),
    })
    return new PrismaClient({ adapter: shardAdapter })
  },
  healthCheckIntervalMs: parseInt(process.env.SHARD_HEALTH_CHECK_INTERVAL_MS || '30000', 10),
  circuitBreakerThreshold: parseInt(process.env.SHARD_CIRCUIT_BREAKER_THRESHOLD || '3', 10),
})

export const getShardForUser = (userId: string): PrismaClient => {
  return sharding.getShard(userId)
}

export const findUserAcrossShards = async <T>(
  finder: (client: PrismaClient) => Promise<T | null>
): Promise<{ result: T | null; shardId: string | null; client: PrismaClient | null }> => {
  return sharding.findFirst(finder)
}

export const initializeSharding = async (): Promise<void> => {
  await sharding.connect()
}

export const shutdownSharding = async (): Promise<void> => {
  await sharding.disconnect()
}
