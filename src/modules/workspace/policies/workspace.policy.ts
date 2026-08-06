import { UserType } from '@prisma/client'
import { AuthorizationError } from '@/errors'
import type { Context } from '@/types/context.type'

export function assertSameWorkspace(context: Context, workspaceId: string) {
  if (context.workspaceId !== workspaceId) {
    throw new AuthorizationError('Cross-workspace access is not allowed')
  }
}

export function assertIsOwner(context: Context) {
  if (context.userType !== UserType.OWNER) {
    throw new AuthorizationError('Only the workspace owner can perform this action')
  }
}
