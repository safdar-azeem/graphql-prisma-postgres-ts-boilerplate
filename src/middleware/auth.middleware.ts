import { Permission, UserType } from '@prisma/client'
import { cache } from '@/cache'
import { verifyAccessToken } from '@/config/tokens'
import { Context } from '@/types/context.type'
import { getShardForUser, sharding } from '@/config/prisma'

export const createContext = async (token: string): Promise<Context> => {
  const bearerToken = token ? token.replace('Bearer ', '') : null

  if (!bearerToken) {
    return { user: null as any, password: '', isAuthenticated: false, client: null as any, permissions: [] }
  }

  try {
    const decoded = verifyAccessToken(bearerToken)

    if (!decoded?._id) {
      return { user: null as any, password: '', isAuthenticated: false, client: null as any, permissions: [] }
    }

    const cachedUser = await cache.getUser(decoded._id)

    if (!cachedUser) {
      return { user: null as any, password: '', isAuthenticated: false, client: null as any, permissions: [] }
    }

    const client = cachedUser.shardId
      ? sharding.getShardById(cachedUser.shardId)
      : getShardForUser(decoded._id)

    // Fetch user with roles to build the typed permissions array
    const dbUser = await client.user.findUnique({
      where: { id: decoded._id },
      include: { roles: true },
    })

    let permissions: Permission[] = []
    let userType: UserType | undefined = decoded.userType

    if (dbUser) {
      const rolePermissions = dbUser.roles.flatMap((r: any) => r.permissions as Permission[])
      permissions = Array.from(
        new Set([...rolePermissions, ...(dbUser.customPermissions as Permission[])])
      )
      userType = dbUser.userType as UserType
    } else {
      permissions = (cachedUser.user.customPermissions as Permission[]) || []
    }

    return {
      user: dbUser ? dbUser : cachedUser.user,
      password: cachedUser.password,
      isAuthenticated: true,
      client,
      userType,
      permissions,
    }
  } catch {
    return { user: null as any, password: '', isAuthenticated: false, client: null as any, permissions: [] }
  }
}
