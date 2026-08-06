import { UserStatus, WorkspaceStatus } from '@prisma/client'
import { cache } from '@/cache'
import { verifyAccessToken } from '@/config/tokens'
import { Context, AuthUser } from '@/types/context.type'
import { getDbForWorkspace, findUserAcrossShards } from '@/config/prisma'
import { computeEffectivePermissions } from '@/authorization/effectivePermissions'
import { DependencyUnavailableError } from '@/errors'

const emptyContext = (partial?: Partial<Context>): Context => ({
  user: null,
  isAuthenticated: false,
  is2faPending: false,
  client: null,
  userType: undefined,
  workspaceId: '',
  workspaceStatus: undefined,
  permissions: [],
  userStatus: undefined,
  ...partial,
})

export const createContext = async (token: string): Promise<Context> => {
  const bearerToken = token ? token.replace('Bearer ', '') : null

  if (!bearerToken) {
    return emptyContext()
  }

  let decoded: ReturnType<typeof verifyAccessToken>
  try {
    decoded = verifyAccessToken(bearerToken)
  } catch {
    return emptyContext()
  }

  if (!decoded?._id) {
    return emptyContext()
  }

  const is2faPending = Boolean(decoded.is2faPending)

  // Cache is only an optional routing hint — never authentication source.
  // When Redis/cache is unavailable, continue with DB lookup.
  let cachedShardId: string | null | undefined
  try {
    const cached = await cache.getUser(decoded._id)
    cachedShardId = cached?.shardId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[Auth] Cache unavailable; continuing with DB authentication:', message)
    cachedShardId = undefined
  }

  let dbUser: any = null
  let client: any = null

  try {
    // Cache shard is only a hint — ignore invalid hints and continue lookup
    if (cachedShardId) {
      try {
        const hinted = getDbForWorkspace({
          workspaceId: decoded.workspaceId || 'unknown',
          shardId: cachedShardId,
        })
        dbUser = await hinted.user.findUnique({
          where: { id: decoded._id },
          include: {
            roles: true,
            workspace: { select: { id: true, shardId: true, status: true } },
          },
        })
        if (dbUser) client = hinted
      } catch {
        await Promise.resolve(cache.invalidateUser(decoded._id)).catch(() => undefined)
        // Fall through to id lookup
      }
    }

    if (!dbUser) {
      const found = await findUserAcrossShards((c) =>
        c.user.findUnique({
          where: { id: decoded._id },
          include: {
            roles: true,
            workspace: { select: { id: true, shardId: true, status: true } },
          },
        })
      )
      dbUser = found.result
      client = found.client
    }
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    throw new DependencyUnavailableError('Failed to load authenticated user', {
      originalError: error instanceof Error ? error : undefined,
    })
  }

  // Deleted / missing user — invalidate cache and reject
  if (!dbUser || !client || !dbUser.workspace) {
    await Promise.resolve(cache.invalidateUser(decoded._id)).catch(() => undefined)
    return emptyContext()
  }

  // Bind to persisted workspace shard exactly (no silent fallback)
  try {
    client = getDbForWorkspace({
      workspaceId: dbUser.workspaceId,
      shardId: dbUser.workspace.shardId,
    })
  } catch (error) {
    throw new DependencyUnavailableError('Database shard unavailable', {
      originalError: error instanceof Error ? error : undefined,
      extensions: {
        workspaceId: dbUser.workspaceId,
        shardId: dbUser.workspace.shardId,
      },
    })
  }

  const workspaceStatus = dbUser.workspace.status as WorkspaceStatus
  const userStatus = dbUser.status as UserStatus

  // Fail closed for inactive workspace (except MFA completion needs its own checks)
  if (workspaceStatus !== WorkspaceStatus.ACTIVE && !is2faPending) {
    await Promise.resolve(cache.invalidateUser(decoded._id)).catch(() => undefined)
    return emptyContext()
  }

  if (userStatus !== UserStatus.ACTIVE && !is2faPending) {
    await Promise.resolve(cache.invalidateUser(decoded._id)).catch(() => undefined)
    return emptyContext()
  }

  const { password: _pw, workspace, ...withoutPassword } = dbUser
  const authUser = withoutPassword as AuthUser
  const permissions = computeEffectivePermissions({
    userType: dbUser.userType,
    rolePermissions: dbUser.roles.map((r: any) => r.permissions),
    customPermissions: dbUser.customPermissions,
  })

  cache
    .setUser(decoded._id, {
      user: authUser,
      workspaceId: dbUser.workspaceId,
      shardId: dbUser.workspace.shardId ?? undefined,
    })
    .catch(() => undefined)

  return {
    user: authUser,
    isAuthenticated: true,
    is2faPending,
    client,
    userType: dbUser.userType,
    workspaceId: dbUser.workspaceId,
    workspaceStatus,
    permissions,
    userStatus,
  }
}
