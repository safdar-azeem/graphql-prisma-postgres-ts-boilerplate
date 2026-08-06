import { Protect } from '@/guards'
import { PERMISSIONS } from '@/authorization/permissions'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import * as RoleService from '../services/role.service'

export const roleResolver: Resolvers<Context> = {
  Query: {
    getRoles: Protect([PERMISSIONS.ROLES_READ], async (_p, args, { workspaceId, client }) => {
      return RoleService.listRoles(client!, workspaceId, args as any) as any
    }),

    getRole: Protect([PERMISSIONS.ROLES_READ], async (_p, { id }, { workspaceId, client }) => {
      return RoleService.getRole(client!, workspaceId, id) as any
    }),
  },

  Mutation: {
    createRole: Protect([PERMISSIONS.ROLES_CREATE], async (_p, { data }, { workspaceId, client }) => {
      return RoleService.createRole(client!, workspaceId, data as any) as any
    }),

    updateRole: Protect(
      [PERMISSIONS.ROLES_UPDATE],
      async (_p, { id, data }, { workspaceId, client }) => {
        return RoleService.updateRole(client!, workspaceId, id, data as any) as any
      }
    ),

    deleteRole: Protect([PERMISSIONS.ROLES_DELETE], async (_p, { id }, { workspaceId, client }) => {
      return RoleService.deleteRole(client!, workspaceId, id)
    }),
  },
}
