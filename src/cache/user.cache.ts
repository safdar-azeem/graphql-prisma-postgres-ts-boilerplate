import { redis } from '@/config/redis'
import { getShardForUser, findUserAcrossShards } from '@/config/prisma'
import { AuthUser } from '@/types/context.type'
import { serialize, deserialize } from '@/utils/serializer.util'

const USER_CACHE_PREFIX = 'user:'
const USER_CACHE_TTL = 3600 // 1 hour in seconds

interface CachedUser {
  user: AuthUser
  password: string
  shardId?: string
}

const getUserCacheKey = (userId: string): string => {
  return `${USER_CACHE_PREFIX}${userId}`
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

  const { result: user, shardId } = await findUserAcrossShards((client) =>
    client.user.findUnique({ where: { id: userId } })
  )

  if (!user || !shardId) {
    return null
  }

  const { password, ...userWithoutPassword } = user

  const cachedUser: CachedUser = {
    user: userWithoutPassword,
    password,
    shardId,
  }

  setUser(userId, cachedUser).catch((err) => {
    console.warn('[UserCache] Failed to set cache:', err.message)
  })

  return cachedUser
}

export const setUser = async (userId: string, data: CachedUser): Promise<void> => {
  const cacheKey = getUserCacheKey(userId)

  try {
    await redis.setex(cacheKey, USER_CACHE_TTL, serialize(data))
  } catch (error: any) {
    console.warn('[UserCache] Failed to set cache:', error.message)
  }
}

export const invalidateUser = async (userId: string): Promise<void> => {
  const cacheKey = getUserCacheKey(userId)

  try {
    await redis.del(cacheKey)
  } catch (error: any) {
    console.warn('[UserCache] Failed to invalidate cache:', error.message)
  }
}

export const invalidateUsers = async (userIds: string[]): Promise<void> => {
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

  const { result: user, shardId } = await findUserAcrossShards((client) =>
    client.user.findUnique({ where: { id: userId } })
  )

  if (!user || !shardId) {
    return null
  }

  const { password, ...userWithoutPassword } = user

  const cachedUser: CachedUser = {
    user: userWithoutPassword,
    password,
    shardId,
  }

  await setUser(userId, cachedUser)

  return cachedUser
}
