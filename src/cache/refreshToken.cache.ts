import { redis } from '@/config/redis'
import { REFRESH_TOKEN_EXPIRES_IN } from '@/constants'

const REFRESH_PREFIX = 'refresh:'

const getKey = (userId: string) => `${REFRESH_PREFIX}${userId}`

/**
 * Stores a refresh token JTI in Redis set for the user.
 * We use a Set to allow multiple valid devices.
 * Ideally, we should also look up by JTI to check validity, but standard pattern
 * is to trust the JWT signature + check `isRevoked` list (blacklist) OR
 * here we use a whitelist approach: token is valid ONLY if its JTI is in Redis.
 *
 * Whitelist approach allows instant revocation.
 */
export const storeRefreshToken = async (userId: string, jti: string): Promise<void> => {
  const key = getKey(userId)
  await redis.sadd(key, jti)
  await redis.expire(key, REFRESH_TOKEN_EXPIRES_IN)
}

export const isRefreshTokenValid = async (userId: string, jti: string): Promise<boolean> => {
  const key = getKey(userId)
  const isMember = await redis.sismember(key, jti)
  return isMember === 1
}

export const revokeRefreshToken = async (userId: string, jti: string): Promise<void> => {
  const key = getKey(userId)
  await redis.srem(key, jti)
}

export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  const key = getKey(userId)
  await redis.del(key)
}
