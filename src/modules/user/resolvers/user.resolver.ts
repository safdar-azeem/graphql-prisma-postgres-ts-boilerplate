import { Permission } from '@prisma/client'
import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { cache } from '@/cache'

export const userResolver: Resolvers<Context> = {
  Query: {
    me: requireAuth(async (_parent, _args, { user, client }) => {
      const fullUser = await client.user.findUnique({
        where: { id: user.id },
        include: { roles: true },
      })

      if (!fullUser) throw new Error('User not found')

      const rolePermissions = fullUser.roles?.flatMap((r: any) => r.permissions as Permission[]) || []
      const mergedPermissions: Permission[] = Array.from(
        new Set([...rolePermissions, ...(fullUser.customPermissions as Permission[])])
      )

      return {
        ...fullUser,
        permissions: mergedPermissions,
      } as any
    }),
  },

  Mutation: {
    updateUserProfile: requireAuth(async (_parent, { data }, { user, client }) => {
      const updated = await client.user.update({
        where: { id: user.id },
        data: {
          ...(data.username !== undefined && { username: data.username }),
          ...(data.avatar !== undefined && { avatar: data.avatar }),
        },
      })

      await cache.invalidateUser(user.id)
      return updated as any
    }),
  },
}
