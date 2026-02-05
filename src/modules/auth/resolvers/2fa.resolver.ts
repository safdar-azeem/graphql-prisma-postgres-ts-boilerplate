import { requireAuth } from '@/guards'
import { authLite } from '@/config/authlite'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { comparePassword, generateToken } from '../utils/auth.utils'
import { AuthenticationError, ValidationError, InternalError } from '@/errors'
import { Prisma } from '@prisma/client'
import { cache } from '@/cache'

export const twoFaResolvers: Resolvers<Context> = {
  Mutation: {
    init2faEnrollment: requireAuth(async (_parent, { method }, { user, client }) => {
      if (!client) throw new InternalError('Database connection failed')

      const mfaSettings = user.mfaSettings
      if (mfaSettings?.isEnabled) {
        throw new ValidationError('MFA is already enabled')
      }

      const { encryptedSecret, qrCode, backupCodes } = await authLite.mfa.createEnrollment(
        user.email
      )

      await client.user.update({
        where: { id: user.id },
        data: {
          mfaSettings: {
            isEnabled: false,
            method,
            secret: encryptedSecret,
            backupCodes,
          },
        },
      })

      await cache.invalidateUser(user.id)

      if (method === 'EMAIL') {
        return {
          secret: 'EMAIL_MODE',
          qrCode: '',
          backupCodes: [],
        }
      }

      return { secret: encryptedSecret, qrCode, backupCodes }
    }),

    confirm2faEnrollment: requireAuth(async (_parent, { token }, { user, client }) => {
      if (!client) throw new InternalError('Database connection failed')

      const mfaSettings = user.mfaSettings

      if (mfaSettings?.method === 'AUTHENTICATOR') {
        if (!mfaSettings.secret) throw new ValidationError('MFA not initialized')
        const isValid = authLite.mfa.verifyTotp({ token, secret: mfaSettings.secret })
        if (!isValid) throw new ValidationError('Invalid OTP code')

        await client.user.update({
          where: { id: user.id },
          data: {
            mfaSettings: {
              ...mfaSettings,
              isEnabled: true,
            },
          },
        })

        await cache.invalidateUser(user.id)

        return true
      }

      if (mfaSettings?.method === 'EMAIL') {
        await client.user.update({
          where: { id: user.id },
          data: {
            mfaSettings: {
              ...mfaSettings,
              isEnabled: true,
            },
          },
        })

        await cache.invalidateUser(user.id)

        return true
      }

      return false
    }),

    disable2fa: requireAuth(
      async (_parent, { password }, { user, client, password: userPassword }) => {
        if (!client) throw new InternalError('Database connection failed')

        if (password) {
          const isValid = await comparePassword(password, userPassword)
          if (!isValid) throw new AuthenticationError('Invalid password')
        }

        await client.user.update({
          where: { id: user.id },
          data: {
            mfaSettings: {
              isEnabled: false,
            },
            otp: Prisma.DbNull,
          },
        })

        await cache.invalidateUser(user.id)

        return true
      }
    ),

    verify2FA: async (_parent, { token }, { user, client }) => {
      const mfaSettings = user.mfaSettings
      if (!mfaSettings?.isEnabled) {
        const jwt = generateToken({ _id: user.id, email: user.email })
        return { token: jwt, user: user }
      }

      let isValid = false

      // Since verify2FA relies on the user being in context (possibly via a temp token),
      // and our middleware finds the user and shard, 'client' should be available.
      if (!client) {
        // Fallback or error if somehow user is present but client isn't which shouldn't happen with our middleware logic
        throw new InternalError('Database connection failed')
      }

      if (mfaSettings.method === 'AUTHENTICATOR') {
        if (mfaSettings.secret) {
          isValid = authLite.mfa.verifyTotp({ token, secret: mfaSettings.secret })
        }
      } else if (mfaSettings.method === 'EMAIL') {
        const otpSettings = user.otp
        if (otpSettings?.code && otpSettings.expiresAt) {
          const now = new Date()
          const expires = new Date(otpSettings.expiresAt)
          if (otpSettings.code === token && expires > now) {
            isValid = true
            await client.user.update({
              where: { id: user.id },
              data: { otp: Prisma.DbNull },
            })

            await cache.invalidateUser(user.id)
          }
        }
      }

      if (!isValid) throw new AuthenticationError('Invalid or expired 2FA code')

      const jwt = generateToken({ _id: user.id, email: user.email })
      return { token: jwt, user }
    },
  },
}
