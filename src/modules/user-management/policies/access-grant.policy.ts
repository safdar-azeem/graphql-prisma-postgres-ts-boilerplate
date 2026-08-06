import { UserType, type PrismaClient } from '@prisma/client'
import { AuthorizationError, ValidationError } from '@/errors'
import type { PermissionId } from '@/authorization/permissions'
import { PERMISSIONS } from '@/authorization/permissions'
import type { Context } from '@/types/context.type'

export type AccessActor = {
  id: string
  userType?: UserType
  permissions: PermissionId[]
}

export function isOwner(actor: AccessActor): boolean {
  return actor.userType === UserType.OWNER
}

export function actorHasPermission(actor: AccessActor, permission: PermissionId): boolean {
  return isOwner(actor) || actor.permissions.includes(permission)
}

export function assertCanManageRoles(actor: AccessActor) {
  if (!actorHasPermission(actor, PERMISSIONS.USERS_MANAGE_ROLES)) {
    throw new AuthorizationError('You do not have permission to manage user roles')
  }
}

export function assertCanManagePermissions(actor: AccessActor) {
  if (!actorHasPermission(actor, PERMISSIONS.USERS_MANAGE_PERMISSIONS)) {
    throw new AuthorizationError('You do not have permission to manage custom permissions')
  }
}

export function assertCanManageStatus(actor: AccessActor) {
  if (!actorHasPermission(actor, PERMISSIONS.USERS_MANAGE_STATUS)) {
    throw new AuthorizationError('You do not have permission to manage user status')
  }
}

/** Members cannot modify their own roles or custom permissions. */
export function assertNotSelfAccessChange(actor: AccessActor, targetUserId: string) {
  if (!isOwner(actor) && actor.id === targetUserId) {
    throw new AuthorizationError('You cannot modify your own roles or custom permissions')
  }
}

/**
 * A non-owner may only grant permissions they themselves possess.
 * Owners may grant any catalog permission.
 */
export function assertCanGrantPermissions(actor: AccessActor, permissions: PermissionId[]) {
  if (isOwner(actor)) return
  const missing = permissions.filter((p) => !actor.permissions.includes(p))
  if (missing.length > 0) {
    throw new AuthorizationError(
      `You cannot grant permissions you do not possess: ${missing.join(', ')}`
    )
  }
}

/**
 * System Admin role assignment is owner-only.
 * Non-owners may only assign roles whose permissions are a subset of their own.
 */
export async function assertCanAssignRoles(
  client: PrismaClient,
  workspaceId: string,
  actor: AccessActor,
  roleIds: string[]
) {
  if (roleIds.length === 0) return

  const roles = await client.role.findMany({
    where: { id: { in: roleIds }, workspaceId },
  })
  if (roles.length !== roleIds.length) {
    throw new ValidationError('One or more role IDs are invalid')
  }

  for (const role of roles) {
    if (role.isSystem && role.name === 'Admin') {
      if (!isOwner(actor)) {
        throw new AuthorizationError('Only the workspace owner can assign the Admin role')
      }
      continue
    }

    if (isOwner(actor)) continue

    const rolePerms = role.permissions as PermissionId[]
    assertCanGrantPermissions(actor, rolePerms)
  }
}

export function actorFromContext(context: Context): AccessActor {
  return {
    id: context.user!.id,
    userType: context.userType,
    permissions: context.permissions,
  }
}
