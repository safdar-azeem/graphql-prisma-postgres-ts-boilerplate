import { Resolvers } from '@/types/types.generated'
import { Context } from '@/types/context.type'
import { AuthenticationError } from '@/errors'
import { verifyRefreshToken, generateTokenPair } from '@/config/tokens'
import {
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  storeRefreshToken,
} from '@/cache/refreshToken.cache'
import { findUserAcrossShards } from '@/config/prisma'
import { requireAuth } from '@/guards'

export const tokenResolver: Resolvers<Context> = {
  Mutation: {
    refreshTokens: async (_parent, { refreshToken }) => {
      const decoded = verifyRefreshToken(refreshToken)

      if (!decoded || !decoded.jti || !decoded.sub) {
        throw new AuthenticationError('Invalid refresh token')
      }

      const isValid = await isRefreshTokenValid(decoded.sub, decoded.jti)
      if (!isValid) {
        throw new AuthenticationError('Invalid or expired refresh token')
      }

      // Token Rotation: Revoke the used refresh token
      await revokeRefreshToken(decoded.sub, decoded.jti)

      // Fetch user
      const { result: user } = await findUserAcrossShards(async (client) => {
        return client.user.findUnique({ where: { id: decoded.sub } })
      })

      if (!user) {
        throw new AuthenticationError('User not found')
      }

      // Generate new pair
      const tokens = generateTokenPair(user)
      await storeRefreshToken(user.id, tokens.jti)

      const { password, ...userWithoutPassword } = user

      return {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: userWithoutPassword,
      }
    },

    logout: requireAuth(async (_parent, _args, { user }, info) => {
      // Note: We can only revoke the specific refresh token if we had it in the context.
      // But standard logout often just clears cookie or client state.
      // To strictly revoke, we'd need the refresh token passed as an arg or header.
      // For now, we will add a TODO or if the client sends refreshToken in args we revoke it.
      // But the schema defined 'logout: Boolean', taking no args.
      // So we can't easily revoke a specific one unless we change schema or read from headers.
      //
      // If using JWTs, strictly speaking, access tokens can't be revoked without blacklist.
      // Refresh tokens CAN be revoked.
      //
      // Let's rely on client dropping it, unless we want 'logout' to mean 'logoutAll'.
      // But we have 'logoutAll'.

      // Since we don't have the refresh token string here, we perform a no-op on backend
      // or we could implement a blacklist for the current access token jti if we had one.
      return true
    }),

    logoutAll: requireAuth(async (_parent, _args, { user }) => {
      await revokeAllRefreshTokens(user.id)
      return true
    }),
  },
}
