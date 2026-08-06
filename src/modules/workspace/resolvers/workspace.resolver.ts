import { Protect, requireAuth } from '@/guards'
import { PERMISSIONS } from '@/authorization/permissions'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { assertIsOwner } from '../policies/workspace.policy'
import * as WorkspaceService from '../services/workspace.service'

export const workspaceResolver: Resolvers<Context> = {
  Query: {
    workspace: Protect([PERMISSIONS.WORKSPACE_READ], async (_p, _a, { client, workspaceId }) => {
      return WorkspaceService.getWorkspace(client!, workspaceId) as any
    }),
  },

  Mutation: {
    updateWorkspace: Protect(
      [PERMISSIONS.WORKSPACE_UPDATE],
      async (_p, { data }, { client, workspaceId }) => {
        return WorkspaceService.updateWorkspace(client!, workspaceId, data as any) as any
      }
    ),

    transferOwnership: requireAuth(async (_p, { data }, context) => {
      assertIsOwner(context)
      return WorkspaceService.transferOwnership(
        context.client!,
        context.workspaceId,
        context.user!.id,
        (data as any).newOwnerUserId
      ) as any
    }),
  },
}
