import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import * as AuthService from '../services/auth.service'

export const authResolver: Resolvers<Context> = {
  Mutation: {
    signup: async (_parent, { data }) => {
      return AuthService.signup(data as any) as any
    },

    login: async (_parent, { data }) => {
      return AuthService.login(data as any) as any
    },

    googleLogin: async (_parent, { token }) => {
      return AuthService.googleLogin(token) as any
    },

    forgotPassword: async (_parent, { email }) => {
      return AuthService.forgotPassword(email)
    },

    resetPassword: async (_parent, { token, password }) => {
      return AuthService.resetPassword(token, password)
    },
  },
}
