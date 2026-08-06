import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { toGraphqlPermissions } from '@/authorization/graphqlPermissions'
import * as UserService from '../services/user.service'

export const userResolver: Resolvers<Context> = {
  Query: {
    me: requireAuth(async (_parent, _args, { user, permissions }) => {
      return {
        ...user,
        permissions: toGraphqlPermissions(permissions),
      } as any
    }),
  },

  Mutation: {
    updateUserProfile: requireAuth(async (_parent, { data }, context) => {
      return UserService.updateProfile(
        context.client!,
        context.user!.id,
        context.workspaceId,
        data as any,
        context.permissions
      ) as any
    }),
  },
}
