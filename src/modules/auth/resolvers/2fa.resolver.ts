import { cache } from '@/cache'
import { requireAuth } from '@/guards'
import { Prisma } from '@prisma/client'
import { authLite } from '@/config/authlite'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { findUserAcrossShards } from '@/config/prisma'
import { comparePassword, verifyToken } from '../utils/auth.utils'
import { AuthenticationError, ValidationError } from '@/errors'
import { sendEmail } from '@/utils/email.util'
import { APP_NAME } from '@/constants'
import { getOtpEmailTemplate } from '@/templates/otp-email.template'

export const twoFaResolvers: Resolvers<Context> = {
  Mutation: {
    init2faEnrollment: requireAuth(async (_parent, { method }, { user, client }) => {
      const mfaSettings = user.mfaSettings
      if (mfaSettings?.isEnabled) {
        throw new ValidationError('MFA is already enabled')
      }

      if (method === 'EMAIL') {
        const otp = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

        await client.user.update({
          where: { id: user.id },
          data: {
            mfaSettings: {
              isEnabled: false,
              method,
              secret: 'EMAIL_MODE',
              backupCodes: [],
            },
            otp: {
              code: otp,
              expiresAt,
            },
          },
        })

        await cache.invalidateUser(user.id)

        await sendEmail(
          user.email,
          `Confirm 2FA Enrollment - ${APP_NAME}`,
          getOtpEmailTemplate({ otp })
        )

        return {
          secret: 'EMAIL_MODE',
          qrCode: '',
          backupCodes: [],
        }
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

      return { secret: encryptedSecret, qrCode, backupCodes }
    }),

    confirm2faEnrollment: requireAuth(async (_parent, { otp }, { user, client }) => {
      const mfaSettings = user.mfaSettings

      if (mfaSettings?.method === 'AUTHENTICATOR') {
        if (!mfaSettings.secret) throw new ValidationError('MFA not initialized')
        const isValid = authLite.mfa.verifyTotp({ token: otp, secret: mfaSettings.secret })
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
        const otpSettings = user.otp

        if (!otpSettings?.code || !otpSettings?.expiresAt) {
          throw new ValidationError('No OTP found. Please request a new one.')
        }

        const now = new Date()
        const expires = new Date(otpSettings.expiresAt)

        if (otpSettings.code !== otp || expires < now) {
          throw new ValidationError('Invalid or expired OTP')
        }

        await client.user.update({
          where: { id: user.id },
          data: {
            mfaSettings: {
              ...mfaSettings,
              isEnabled: true,
            },
            otp: Prisma.DbNull,
          },
        })

        await cache.invalidateUser(user.id)

        return true
      }

      return false
    }),

    disable2fa: requireAuth(
      async (_parent, { password }, { user, client, password: userPassword }) => {
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

    verify2FA: async (_parent, { otp, token }) => {
      const bearerToken = token ? token.replace('Bearer ', '') : null

      if (!bearerToken) {
        throw new AuthenticationError('Authentication token must be provided')
      }

      const decoded = verifyToken(token)

      if (!decoded?._id) {
        throw new AuthenticationError(`Invalid token`)
      }

      const { result: user, client } = await findUserAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({
          where: { id: decoded._id },
        })
      })

      if (!user || !client) {
        throw new AuthenticationError('Account Not Found')
      }

      const mfaSettings = user.mfaSettings
      if (!mfaSettings?.isEnabled) {
        return { token, user: user }
      }

      let isValid = false

      if (mfaSettings.method === 'AUTHENTICATOR') {
        if (mfaSettings.secret) {
          isValid = authLite.mfa.verifyTotp({ token: otp, secret: mfaSettings.secret })
        }
      } else if (mfaSettings.method === 'EMAIL') {
        const otpSettings = user.otp
        if (otpSettings?.code && otpSettings.expiresAt) {
          const now = new Date()
          const expires = new Date(otpSettings.expiresAt)
          if (otpSettings.code === otp && expires > now) {
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

      return { token, user }
    },
  },
}

