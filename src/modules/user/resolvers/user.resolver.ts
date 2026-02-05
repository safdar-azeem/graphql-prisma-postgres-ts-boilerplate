import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'

export const userResolver: Resolvers<Context> = {
  Query: {
    me: requireAuth(async (_parent, _args, { user }) => {
      return user
    }),
  },
}
