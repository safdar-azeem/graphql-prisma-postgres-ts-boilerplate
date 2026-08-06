import { UserType, UserStatus, type PrismaClient } from '@prisma/client'
import { NotFoundError, ValidationError, AuthorizationError } from '@/errors'

export async function getWorkspaceMember(
  client: PrismaClient,
  workspaceId: string,
  userId: string
) {
  const user = await client.user.findFirst({
    where: { id: userId, workspaceId },
    include: { roles: true },
  })
  if (!user) throw new NotFoundError('User not found')
  return user
}

export function assertNotOwnerTarget(user: { userType: UserType }, action: string) {
  if (user.userType === UserType.OWNER) {
    throw new ValidationError(`Cannot ${action} the workspace owner through user management`)
  }
}

export function assertCanSuspend(
  actorUserType: UserType | undefined,
  target: { userType: UserType; id: string },
  actorId: string
) {
  if (target.userType === UserType.OWNER) {
    throw new AuthorizationError('The workspace owner cannot be suspended')
  }
  if (target.id === actorId && actorUserType !== UserType.OWNER) {
    throw new ValidationError('You cannot suspend your own account')
  }
}

export async function assertRolesInWorkspace(
  client: PrismaClient,
  workspaceId: string,
  roleIds: string[]
) {
  if (roleIds.length === 0) return
  const roles = await client.role.findMany({
    where: { id: { in: roleIds }, workspaceId },
  })
  if (roles.length !== roleIds.length) {
    throw new ValidationError('One or more role IDs are invalid')
  }
}

export { UserStatus }
