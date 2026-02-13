import { cache } from '@/cache'
import { verifyAccessToken } from '@/config/tokens'
import { Context } from '@/types/context.type'
import { getShardForUser, sharding } from '@/config/prisma'

export const createContext = async (token: string): Promise<Context> => {
  const bearerToken = token ? token.replace('Bearer ', '') : null

  if (!bearerToken) {
    return {
      user: null as any,
      password: '',
      isAuthenticated: false,
      client: null as any,
    }
  }

  try {
    const decoded = verifyAccessToken(bearerToken)

    if (!decoded?._id) {
      return {
        user: null as any,
        password: '',
        isAuthenticated: false,
        client: null as any,
      }
    }

    const cachedUser = await cache.getUser(decoded._id)

    if (!cachedUser) {
      return {
        user: null as any,
        password: '',
        isAuthenticated: false,
        client: null as any,
      }
    }

    const client = cachedUser.shardId
      ? sharding.getShardById(cachedUser.shardId)
      : getShardForUser(decoded._id)

    return {
      user: cachedUser.user,
      password: cachedUser.password,
      isAuthenticated: true,
      client,
    }
  } catch (error) {
    return {
      user: null as any,
      password: '',
      isAuthenticated: false,
      client: null as any,
    }
  }
}
