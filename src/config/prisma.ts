import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { PrismaSharding } from 'prisma-sharding'
import { DependencyUnavailableError } from '@/errors'

const validateDatabaseUrl = (url: string | undefined, label: string): string => {
  if (!url || !url.trim()) {
    throw new Error(`${label} is required`)
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${label} is not a valid URL`)
  }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use the postgresql:// protocol`)
  }
  return url
}

const poolConfig = {
  max: parseInt(process.env.SHARD_POOL_SIZE || process.env.DB_POOL_SIZE || '10', 10),
  idleTimeoutMillis: parseInt(process.env.SHARD_IDLE_TIMEOUT_MS || '10000', 10),
  connectionTimeoutMillis: parseInt(process.env.SHARD_CONNECTION_TIMEOUT_MS || '5000', 10),
}

const createPrismaClient = (connectionString: string): PrismaClient => {
  const adapter = new PrismaPg({
    connectionString,
    ...poolConfig,
  })
  return new PrismaClient({ adapter })
}

const defaultUrl = validateDatabaseUrl(process.env.DATABASE_URL, 'DATABASE_URL')
/** Control-plane / default DB client (identity reservation, readiness). */
export const prisma = createPrismaClient(defaultUrl)

const SHARD_COUNT = parseInt(process.env.SHARD_COUNT || '1', 10)

const buildShardConfigs = () => {
  const shards: { id: string; url: string }[] = []
  for (let i = 1; i <= SHARD_COUNT; i++) {
    const url = process.env[`SHARD_${i}_URL`]
    if (url) {
      shards.push({ id: `shard_${i}`, url: validateDatabaseUrl(url, `SHARD_${i}_URL`) })
    }
  }

  if (shards.length === 0) {
    shards.push({ id: 'shard_1', url: defaultUrl })
  }

  return shards
}

export const sharding = new PrismaSharding<PrismaClient>({
  shards: buildShardConfigs(),
  strategy: (process.env.SHARD_ROUTING_STRATEGY as 'modulo' | 'consistent-hash') || 'modulo',
  createClient: (url) => createPrismaClient(url),
  healthCheckIntervalMs: parseInt(process.env.SHARD_HEALTH_CHECK_INTERVAL_MS || '30000', 10),
  circuitBreakerThreshold: parseInt(process.env.SHARD_CIRCUIT_BREAKER_THRESHOLD || '3', 10),
})

/**
 * Resolve client for a workspace.
 * When a persisted shardId exists it MUST resolve exactly — never fall back.
 */
export const getDbForWorkspace = (opts: {
  workspaceId: string
  shardId?: string | null
}): PrismaClient => {
  if (opts.shardId) {
    try {
      return sharding.getShardById(opts.shardId)
    } catch (error) {
      throw new DependencyUnavailableError(
        `Workspace shard is unavailable or misconfigured`,
        {
          originalError: error instanceof Error ? error : undefined,
          extensions: {
            workspaceId: opts.workspaceId,
            shardId: opts.shardId,
          },
        }
      )
    }
  }
  // New workspace without assignment yet — deterministic routing by workspace id
  return sharding.getShard(opts.workspaceId)
}

/** Assign shard for a brand-new workspace and return client + shard id. */
export const assignWorkspaceShard = (
  workspaceId: string
): { client: PrismaClient; shardId: string } => {
  const { client, shardId } = sharding.getShardWithInfo(workspaceId)
  return { client, shardId }
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
  await Promise.all([sharding.disconnect(), prisma.$disconnect()])
}

export const checkDatabaseReady = async (): Promise<{
  ready: boolean
  defaultOk: boolean
  unhealthyShards: string[]
}> => {
  let defaultOk = false
  try {
    await prisma.$queryRaw`SELECT 1`
    defaultOk = true
  } catch {
    defaultOk = false
  }

  let unhealthyShards: string[] = []
  try {
    if (!sharding.isConnected()) {
      await sharding.connect()
    }
    const health = sharding.getHealth()
    unhealthyShards = health.filter((h) => !h.isHealthy).map((h) => h.shardId)
  } catch {
    // Shard health is supplemental; default DB decides core readiness
  }

  return { ready: defaultOk, defaultOk, unhealthyShards }
}
