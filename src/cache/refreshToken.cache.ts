import { redis } from '@/config/redis'
import { REFRESH_TOKEN_EXPIRES_IN } from '@/constants'
import { AuthenticationError } from '@/errors'

const REFRESH_PREFIX = 'refresh:'

const getKey = (userId: string) => `${REFRESH_PREFIX}${userId}`

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

/**
 * Atomically consume old JTI and store the new one.
 * Returns false if old JTI was already consumed (reuse detected).
 */
const ROTATE_SCRIPT = `
local removed = redis.call('SREM', KEYS[1], ARGV[1])
if removed == 0 then
  return 0
end
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`

export const rotateRefreshToken = async (
  userId: string,
  oldJti: string,
  newJti: string
): Promise<'ok' | 'reuse'> => {
  const key = getKey(userId)
  const result = await redis.eval(
    ROTATE_SCRIPT,
    1,
    key,
    oldJti,
    newJti,
    String(REFRESH_TOKEN_EXPIRES_IN)
  )

  if (result === 0) {
    // Reuse detected — revoke all sessions for this user
    await revokeAllRefreshTokens(userId)
    return 'reuse'
  }
  return 'ok'
}

export async function assertRotated(
  userId: string,
  oldJti: string,
  newJti: string
): Promise<void> {
  const outcome = await rotateRefreshToken(userId, oldJti, newJti)
  if (outcome === 'reuse') {
    throw new AuthenticationError('Refresh token reuse detected. All sessions have been revoked.')
  }
}
