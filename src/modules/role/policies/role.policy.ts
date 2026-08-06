import { NotFoundError, ValidationError } from '@/errors'
import type { PrismaClient } from '@prisma/client'

export async function getWorkspaceRole(
  client: PrismaClient,
  workspaceId: string,
  roleId: string
) {
  const role = await client.role.findFirst({ where: { id: roleId, workspaceId } })
  if (!role) throw new NotFoundError('Role not found')
  return role
}

export function assertRoleMutable(role: { isSystem: boolean }, action: string) {
  if (role.isSystem) {
    throw new ValidationError(`System roles cannot be ${action}`)
  }
}
