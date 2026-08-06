import { Resolvers } from '@/types/types.generated'
import { Context } from '@/types/context.type'
import { requireAuth } from '@/guards'
import * as AuthService from '../services/auth.service'

export const tokenResolver: Resolvers<Context> = {
  Mutation: {
    refreshTokens: async (_parent, { refreshToken }) => {
      return AuthService.refreshTokens(refreshToken) as any
    },

    logout: requireAuth(async (_parent, args, { user }) => {
      return AuthService.logout(user!.id, (args as any).refreshToken)
    }),

    logoutAll: requireAuth(async (_parent, _args, { user }) => {
      return AuthService.logoutAll(user!.id)
    }),
  },
}
