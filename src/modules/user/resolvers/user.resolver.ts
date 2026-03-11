import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { cache } from '@/cache'

export const userResolver: Resolvers<Context> = {
  Query: {
    // permissions are already computed in context by auth middleware — no extra DB fetch needed
    me: requireAuth(async (_parent, _args, { user, permissions }) => {
      return {
        ...user,
        permissions,
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
