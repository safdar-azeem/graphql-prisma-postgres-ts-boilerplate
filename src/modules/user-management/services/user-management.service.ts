import crypto from 'crypto'
import { UserStatus, UserType, type PrismaClient } from '@prisma/client'
import {
  AuthorizationError,
  DependencyUnavailableError,
  NotFoundError,
  ValidationError,
  mapPrismaError,
} from '@/errors'
import { cache } from '@/cache'
import { getDbForWorkspace } from '@/config/prisma'
import { hashPassword } from '@/modules/auth/utils/auth.utils'
import {
  activateAfterShardCommit,
  reserveEmail,
  releaseAfterFailedShardWrite,
  markReleasePendingBeforeDelete,
  finalizeReleaseAfterUserDelete,
} from '@/identity/email-reservation.service'
import { getPagination, getPageInfo, getDateRangeFilter, getSafeOrderBy } from '@/utils/query.util'
import { toGraphqlPermissions } from '@/authorization/graphqlPermissions'
import {
  parseCustomPermissions,
  validateCreateUserInput,
} from '../validation/user-management.schema'
import {
  assertCanSuspend,
  assertNotOwnerTarget,
  assertRolesInWorkspace,
  getWorkspaceMember,
} from '../policies/user-management.policy'
import {
  type AccessActor,
  assertCanAssignRoles,
  assertCanGrantPermissions,
  assertCanManagePermissions,
  assertCanManageRoles,
  assertCanManageStatus,
  assertNotSelfAccessChange,
  isOwner,
} from '../policies/access-grant.policy'

const USER_SORT_FIELDS = ['username', 'email', 'createdAt', 'updatedAt', 'id'] as const

function mapManagedUser(user: any) {
  const { password: _p, ...rest } = user
  return {
    ...rest,
    customPermissions: toGraphqlPermissions(user.customPermissions || []),
    roles: (user.roles || []).map((role: any) => ({
      ...role,
      permissions: toGraphqlPermissions(role.permissions || []),
    })),
  }
}

export async function listUsers(
  client: PrismaClient,
  workspaceId: string,
  args: { pagination?: any; search?: string | null; filter?: any; sort?: any }
) {
  const { page, limit, skip } = getPagination(args.pagination)
  const where: any = {
    workspaceId,
    userType: { not: UserType.OWNER },
  }

  if (args.filter?.status) where.status = args.filter.status
  if (args.search) {
    where.OR = [
      { username: { contains: args.search, mode: 'insensitive' } },
      { email: { contains: args.search, mode: 'insensitive' } },
    ]
  }

  const dateFilter = getDateRangeFilter(args.filter?.dateRange)
  if (dateFilter) where.createdAt = dateFilter

  const orderBy = getSafeOrderBy(
    {
      field: args.sort?.field,
      direction:
        args.sort?.direction === 'ASC'
          ? 'asc'
          : args.sort?.direction === 'DESC'
            ? 'desc'
            : args.sort?.direction,
    },
    USER_SORT_FIELDS,
    'createdAt',
    'desc'
  )

  const [items, totalItems] = await Promise.all([
    client.user.findMany({
      where,
      skip,
      take: limit,
      include: { roles: true },
      orderBy,
    }),
    client.user.count({ where }),
  ])

  return {
    items: items.map(mapManagedUser),
    pageInfo: getPageInfo(totalItems, limit, page),
  }
}

export async function getUser(client: PrismaClient, workspaceId: string, id: string) {
  const user = await getWorkspaceMember(client, workspaceId, id)
  return mapManagedUser(user)
}

export async function createUser(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  data: {
    email: string
    username: string
    password: string
    roleIds?: string[] | null
    customPermissions?: string[] | null
  }
) {
  const input = validateCreateUserInput(data)
  const roleIds = data.roleIds || []
  const customPermissions = input.customPermissions

  if (roleIds.length > 0) {
    assertCanManageRoles(actor)
    await assertCanAssignRoles(client, workspaceId, actor, roleIds)
  }

  if (customPermissions.length > 0) {
    assertCanManagePermissions(actor)
    assertCanGrantPermissions(actor, customPermissions)
  }

  await assertRolesInWorkspace(client, workspaceId, roleIds)
  const hashedPassword = await hashPassword(input.password)
  const userId = crypto.randomUUID()

  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, shardId: true },
  })
  if (!workspace) {
    throw new NotFoundError('Workspace not found')
  }
  if (!workspace.shardId) {
    throw new ValidationError(
      'Workspace has no persisted shard assignment; backfill shardId before creating members'
    )
  }

  const routedClient = getDbForWorkspace({
    workspaceId,
    shardId: workspace.shardId,
  })
  if (routedClient !== client) {
    throw new DependencyUnavailableError(
      'Workspace shard assignment does not match the request database client',
      { extensions: { workspaceId, shardId: workspace.shardId } }
    )
  }

  await reserveEmail({
    email: input.email,
    userId,
    workspaceId,
    shardId: workspace.shardId,
  })

  let newUser
  try {
    newUser = await client.user.create({
      data: {
        id: userId,
        email: input.email,
        username: input.username,
        password: hashedPassword,
        userType: UserType.MEMBER,
        status: UserStatus.ACTIVE,
        workspaceId,
        customPermissions,
        ...(roleIds.length > 0 && { roles: { connect: roleIds.map((id) => ({ id })) } }),
      },
      include: { roles: true },
    })
  } catch (error) {
    await releaseAfterFailedShardWrite(input.email, userId)
    const mapped = mapPrismaError(error)
    if (mapped) throw mapped
    throw error
  }

  await activateAfterShardCommit(input.email, userId)
  return mapManagedUser(newUser)
}

/** Profile-only update — no roles, permissions, or status. */
export async function updateUser(
  client: PrismaClient,
  workspaceId: string,
  id: string,
  data: {
    username?: string | null
    avatar?: string | null
  }
) {
  const target = await getWorkspaceMember(client, workspaceId, id)
  assertNotOwnerTarget(target, 'update')

  const updated = await client.user.update({
    where: { id },
    data: {
      ...(data.username !== undefined &&
        data.username !== null && { username: data.username.trim() }),
      ...(data.avatar !== undefined && { avatar: data.avatar }),
    },
    include: { roles: true },
  })

  await cache.invalidateUser(id)
  return mapManagedUser(updated)
}

export async function updateUserStatus(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  id: string,
  status: UserStatus
) {
  assertCanManageStatus(actor)
  const target = await getWorkspaceMember(client, workspaceId, id)
  assertNotOwnerTarget(target, 'change status of')

  if (status === UserStatus.SUSPENDED) {
    assertCanSuspend(actor.userType, target, actor.id)
  }

  const updated = await client.user.update({
    where: { id },
    data: { status },
    include: { roles: true },
  })
  await cache.invalidateUser(id)
  return mapManagedUser(updated)
}

export async function setUserRoles(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  userId: string,
  roleIds: string[]
) {
  assertCanManageRoles(actor)
  assertNotSelfAccessChange(actor, userId)
  const target = await getWorkspaceMember(client, workspaceId, userId)
  assertNotOwnerTarget(target, 'modify roles for')
  await assertCanAssignRoles(client, workspaceId, actor, roleIds)

  const updated = await client.user.update({
    where: { id: userId },
    data: { roles: { set: roleIds.map((id) => ({ id })) } },
    include: { roles: true },
  })
  await cache.invalidateUser(userId)
  return mapManagedUser(updated)
}

export async function setUserPermissions(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  userId: string,
  customPermissionsInput: string[]
) {
  assertCanManagePermissions(actor)
  assertNotSelfAccessChange(actor, userId)
  const target = await getWorkspaceMember(client, workspaceId, userId)
  assertNotOwnerTarget(target, 'modify permissions for')

  const customPermissions = parseCustomPermissions(customPermissionsInput) || []
  assertCanGrantPermissions(actor, customPermissions)

  const updated = await client.user.update({
    where: { id: userId },
    data: { customPermissions },
    include: { roles: true },
  })
  await cache.invalidateUser(userId)
  return mapManagedUser(updated)
}

export async function deleteUser(client: PrismaClient, workspaceId: string, id: string) {
  const target = await getWorkspaceMember(client, workspaceId, id)
  assertNotOwnerTarget(target, 'delete')
  const email = target.email as string

  // Durable marker first — control-plane outage aborts before shard delete
  await markReleasePendingBeforeDelete(email, id)

  await client.user.delete({ where: { id } })

  try {
    // Remove RELEASE_PENDING reservation; failures leave a discoverable row for reconcile
    await finalizeReleaseAfterUserDelete(email, id)
  } finally {
    // Always drop cache after successful shard deletion, even if finalize fails
    try {
      await cache.invalidateUser(id)
    } catch {
      // Cache cleanup must not replace the identity cleanup error
    }
  }
  return true
}

export async function assignRoles(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  userId: string,
  roleIds: string[]
) {
  assertCanManageRoles(actor)
  assertNotSelfAccessChange(actor, userId)
  const target = await getWorkspaceMember(client, workspaceId, userId)
  assertNotOwnerTarget(target, 'modify roles for')
  await assertCanAssignRoles(client, workspaceId, actor, roleIds)

  const updated = await client.user.update({
    where: { id: userId },
    data: { roles: { connect: roleIds.map((id) => ({ id })) } },
    include: { roles: true },
  })
  await cache.invalidateUser(userId)
  return mapManagedUser(updated)
}

export async function removeRoles(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  userId: string,
  roleIds: string[]
) {
  assertCanManageRoles(actor)
  assertNotSelfAccessChange(actor, userId)
  const target = await getWorkspaceMember(client, workspaceId, userId)
  assertNotOwnerTarget(target, 'modify roles for')

  if (!isOwner(actor)) {
    const roles = await client.role.findMany({
      where: { id: { in: roleIds }, workspaceId },
    })
    if (roles.some((r) => r.isSystem && r.name === 'Admin')) {
      throw new AuthorizationError('Only the workspace owner can modify Admin role assignment')
    }
  }

  const updated = await client.user.update({
    where: { id: userId },
    data: { roles: { disconnect: roleIds.map((id) => ({ id })) } },
    include: { roles: true },
  })
  await cache.invalidateUser(userId)
  return mapManagedUser(updated)
}
