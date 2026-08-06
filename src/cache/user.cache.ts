import { redis, isRedisHealthy } from '@/config/redis'
import { findUserAcrossShards } from '@/config/prisma'
import { AuthUser } from '@/types/context.type'
import { serialize, deserialize } from '@/utils/serializer.util'

const USER_CACHE_PREFIX = 'user:'
const USER_CACHE_TTL = 3600 // 1 hour in seconds

interface CachedUser {
  user: AuthUser
  workspaceId: string
  shardId?: string
}

const getUserCacheKey = (userId: string): string => {
  return `${USER_CACHE_PREFIX}${userId}`
}

const toAuthUser = (user: { password?: string } & Record<string, unknown>): AuthUser => {
  const { password: _password, ...rest } = user
  return rest as AuthUser
}

export const getUser = async (userId: string): Promise<CachedUser | null> => {
  const cacheKey = getUserCacheKey(userId)

  try {
    const cachedData = await redis.get(cacheKey)

    if (cachedData) {
      const deserializedData = deserialize<CachedUser>(cachedData)
      if (deserializedData) {
        return deserializedData
      }
    }
  } catch (error: any) {
    console.warn('[UserCache] Cache read failed, falling back to DB:', error.message)
  }

  const { result: user, shardId, client } = await findUserAcrossShards((c) =>
    c.user.findUnique({
      where: { id: userId },
      include: { workspace: { select: { shardId: true } } },
    })
  )

  if (!user || !shardId || !client) {
    return null
  }

  const workspaceShardId = (user as any).workspace?.shardId ?? shardId
  const authUser = toAuthUser(user as any)

  const cachedUser: CachedUser = {
    user: authUser,
    workspaceId: authUser.workspaceId,
    shardId: workspaceShardId,
  }

  setUser(userId, cachedUser).catch((err) => {
    console.warn('[UserCache] Failed to set cache:', err.message)
  })

  return cachedUser
}

export const setUser = async (userId: string, data: CachedUser): Promise<void> => {
  if (!isRedisHealthy()) return

  const cacheKey = getUserCacheKey(userId)

  try {
    await redis.setex(cacheKey, USER_CACHE_TTL, serialize(data))
  } catch (error: any) {
    console.warn('[UserCache] Failed to set cache:', error.message)
  }
}

export const invalidateUser = async (userId: string): Promise<void> => {
  if (!isRedisHealthy()) return

  const cacheKey = getUserCacheKey(userId)

  try {
    await redis.del(cacheKey)
  } catch (error: any) {
    console.warn('[UserCache] Failed to invalidate cache:', error.message)
  }
}

export const invalidateUsers = async (userIds: string[]): Promise<void> => {
  if (!isRedisHealthy()) return
  if (userIds.length === 0) return

  const cacheKeys = userIds.map(getUserCacheKey)

  try {
    await redis.del(...cacheKeys)
  } catch (error: any) {
    console.warn('[UserCache] Failed to batch invalidate cache:', error.message)
  }
}

export const refreshUser = async (userId: string): Promise<CachedUser | null> => {
  await invalidateUser(userId)
  return getUser(userId)
}

/** Load password hash only when needed for verification — never put in context. */
export const getUserPasswordHash = async (
  userId: string,
  client: { user: { findUnique: Function } }
): Promise<string | null> => {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  return user?.password ?? null
}
