import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { cache } from '@/cache'

export const userResolver: Resolvers<Context> = {
  Query: {
    me: requireAuth(async (_parent, _args, { user }) => {
      return user
    }),
  },
  Mutation: {
    updateUserProfile: requireAuth(async (_parent, { data }, { user, client }) => {
      const updatedUser = await client.user.update({
        where: { id: user.id },
        data: {
          username: data.username ?? undefined,
          avatar: data.avatar ?? undefined,
        },
      })

      await cache.invalidateUser(user.id)

      return updatedUser
    }),
  },
}
