import { requireAuth } from '@/guards'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import * as MfaService from '../services/mfa.service'
import * as AuthService from '../services/auth.service'

export const twoFaResolvers: Resolvers<Context> = {
  Mutation: {
    init2faEnrollment: requireAuth(async (_parent, { method }, { user, client }) => {
      return MfaService.init2faEnrollment(client!, user!, method as 'EMAIL' | 'AUTHENTICATOR') as any
    }),

    confirm2faEnrollment: requireAuth(async (_parent, { otp }, { user, client }) => {
      return MfaService.confirm2faEnrollment(client!, user!, otp)
    }),

    disable2fa: requireAuth(async (_parent, { password }, { user, client }) => {
      return MfaService.disable2fa(client!, user!.id, password)
    }),

    verify2FA: async (_parent, { otp, token }) => {
      return AuthService.verify2FA(token, otp) as any
    },
  },
}
