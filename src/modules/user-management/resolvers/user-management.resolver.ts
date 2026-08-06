import { Protect } from '@/guards'
import { PERMISSIONS } from '@/authorization/permissions'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { actorFromContext } from '../policies/access-grant.policy'
import * as UserManagementService from '../services/user-management.service'

export const userManagementResolver: Resolvers<Context> = {
  Query: {
    getUsers: Protect([PERMISSIONS.USERS_READ], async (_p, args, { workspaceId, client }) => {
      return UserManagementService.listUsers(client!, workspaceId, args as any) as any
    }),

    getUser: Protect([PERMISSIONS.USERS_READ], async (_p, { id }, { workspaceId, client }) => {
      return UserManagementService.getUser(client!, workspaceId, id) as any
    }),
  },

  Mutation: {
    createUser: Protect([PERMISSIONS.USERS_CREATE], async (_p, { data }, context) => {
      return UserManagementService.createUser(
        context.client!,
        context.workspaceId,
        actorFromContext(context),
        data as any
      ) as any
    }),

    updateUser: Protect([PERMISSIONS.USERS_UPDATE], async (_p, { id, data }, context) => {
      return UserManagementService.updateUser(
        context.client!,
        context.workspaceId,
        id,
        data as any
      ) as any
    }),

    updateUserStatus: Protect(
      [PERMISSIONS.USERS_MANAGE_STATUS],
      async (_p, { id, data }, context) => {
        return UserManagementService.updateUserStatus(
          context.client!,
          context.workspaceId,
          actorFromContext(context),
          id,
          (data as any).status
        ) as any
      }
    ),

    setUserRoles: Protect([PERMISSIONS.USERS_MANAGE_ROLES], async (_p, { userId, data }, context) => {
      return UserManagementService.setUserRoles(
        context.client!,
        context.workspaceId,
        actorFromContext(context),
        userId,
        (data as any).roleIds as string[]
      ) as any
    }),

    setUserPermissions: Protect(
      [PERMISSIONS.USERS_MANAGE_PERMISSIONS],
      async (_p, { userId, data }, context) => {
        return UserManagementService.setUserPermissions(
          context.client!,
          context.workspaceId,
          actorFromContext(context),
          userId,
          (data as any).customPermissions as string[]
        ) as any
      }
    ),

    deleteUser: Protect([PERMISSIONS.USERS_DELETE], async (_p, { id }, { workspaceId, client }) => {
      return UserManagementService.deleteUser(client!, workspaceId, id)
    }),

    assignRolesToUser: Protect(
      [PERMISSIONS.USERS_MANAGE_ROLES],
      async (_p, { userId, roleIds }, context) => {
        return UserManagementService.assignRoles(
          context.client!,
          context.workspaceId,
          actorFromContext(context),
          userId,
          roleIds as string[]
        ) as any
      }
    ),

    removeRolesFromUser: Protect(
      [PERMISSIONS.USERS_MANAGE_ROLES],
      async (_p, { userId, roleIds }, context) => {
        return UserManagementService.removeRoles(
          context.client!,
          context.workspaceId,
          actorFromContext(context),
          userId,
          roleIds as string[]
        ) as any
      }
    ),
  },
}
