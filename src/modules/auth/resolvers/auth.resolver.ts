import { APP_NAME } from '@/constants'
import { sharding } from '@/config/sharding'
import { MfaSettings, OtpSettings, PasswordResetSettings } from '../types/db.types'
import { authLite } from '@/config/authlite'
import { Prisma, PrismaClient, UserType } from '@/generated/prisma/client'
import {
  CrossShardOverloadedError,
  CrossShardTimeoutError,
  ShardOwnershipNotFoundError,
  ShardSearchIncompleteError,
  ShardUnavailableError,
} from 'prisma-sharding'
import { sendEmail } from '@/utils/email.util'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { AuthenticationError, ValidationError } from '@/errors'
import { hashPassword, comparePassword } from '../utils/auth.utils'
import { generateTokenPair, generateAccessToken } from '@/config/tokens'
import { storeRefreshToken } from '@/cache/refreshToken.cache'
import { getOtpEmailTemplate } from '@/templates/otp-email.template'
import { getResetPasswordEmailTemplate } from '@/templates/reset-password.template'
import { cache } from '@/cache'
import { generateOtp } from '@/utils/otp.util'
import crypto, { randomUUID } from 'node:crypto'

export const authResolver: Resolvers<Context> = {
  Mutation: {
    signup: async (_parent, { data }) => {
      const { email, username, password } = data

      const { data: existingUser } = await sharding.findAcrossShards(async (client) => {
        return client.user.findFirst({
          where: {
            OR: [
              { email, userType: UserType.OWNER },
              { username, userType: UserType.OWNER },
            ],
          },
        })
      })

      if (existingUser) {
        throw new ValidationError('Email or username already in use')
      }

      const hashedPassword = await hashPassword(password)
      const userId = randomUUID()
      const shardClient = await sharding.allocateShard(userId)

      const user = await shardClient.user.create({
        data: {
          id: userId,
          email,
          username,
          password: hashedPassword,
          userType: UserType.OWNER,
        },
      })

      const tokens = generateTokenPair(user)
      await storeRefreshToken(user.id, tokens.jti)

      const { password: _, ...userWithoutPassword } = user

      return {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: userWithoutPassword as any,
      }
    },

    login: async (_parent, { data }) => {
      const { email, password } = data

      const { data: user } = await sharding.findAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({ where: { email } })
      })

      if (!user) {
        throw new AuthenticationError('Invalid email or password')
      }

      const client = await sharding.resolveShard(user.ownerId || user.id)

      if (!user.password) {
        throw new AuthenticationError('Invalid login method. Try Google Login.')
      }

      const isValid = await comparePassword(password, user.password)
      if (!isValid) {
        throw new AuthenticationError('Invalid email or password')
      }

      const { password: _, ...userWithOutPassword } = user
      const mfaSettings = user.mfaSettings as MfaSettings | null

      if (mfaSettings?.isEnabled) {
        if (mfaSettings.method === 'EMAIL') {
          const { otp, expiresAt } = generateOtp()
          const otpSettings: OtpSettings = { code: otp, expiresAt }

          await client.user.update({
            where: { id: user.id },
            data: { otp: otpSettings as any },
          })

          await cache.invalidateUser(user.id)
          await sendEmail(user.email, `Your Login OTP for ${APP_NAME}`, getOtpEmailTemplate({ otp }))
        }

        const tempToken = generateAccessToken({
          _id: user.id,
          routingKey: user.ownerId || user.id,
          email: user.email,
          userType: user.userType,
          is2faPending: true,
        })

        return { token: tempToken, refreshToken: '', user: userWithOutPassword as any }
      }

      const tokens = generateTokenPair(user)
      await storeRefreshToken(user.id, tokens.jti)

      return {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: userWithOutPassword as any,
      }
    },

    googleLogin: async (_parent, { token }) => {
      try {
        const googleUser = await authLite.google.verify(token, 'web')

        let { data: user } = await sharding.findAcrossShards(async (shardClient) => {
          return shardClient.user.findFirst({ where: { email: googleUser.email } })
        })

        let client: PrismaClient

        if (!user) {
          const randomPassword =
            Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10)
          const hashedPassword = await hashPassword(randomPassword)

          const userId = randomUUID()
          client = await sharding.allocateShard(userId)
          user = await client.user.create({
            data: {
              id: userId,
              email: googleUser.email,
              username: googleUser.name || googleUser.email.split('@')[0],
              password: hashedPassword,
              googleId: googleUser.googleId,
              userType: UserType.OWNER,
            },
          })
        } else {
          client = await sharding.resolveShard(user.ownerId || user.id)
          if (!user.googleId) {
            user = await client.user.update({
              where: { id: user.id },
              data: { googleId: googleUser.googleId },
            })
            await cache.invalidateUser(user.id)
          }
        }

        const { password: _, ...userWithOutPassword } = user
        const mfaSettings = user.mfaSettings as MfaSettings | null

        if (mfaSettings?.isEnabled) {
          if (mfaSettings.method === 'EMAIL') {
            const { otp, expiresAt } = generateOtp()
            const otpSettings: OtpSettings = { code: otp, expiresAt }

            await client.user.update({
              where: { id: user.id },
              data: { otp: otpSettings as any },
            })

            await cache.invalidateUser(user.id)
            sendEmail(user.email, `Your Login OTP for ${APP_NAME}`, getOtpEmailTemplate({ otp }))
          }

          const tempToken = generateAccessToken({
            _id: user.id,
            routingKey: user.ownerId || user.id,
            email: user.email,
            userType: user.userType,
            is2faPending: true,
          })

          return { token: tempToken, refreshToken: '', user: userWithOutPassword as any }
        }

        const tokens = generateTokenPair(user)
        await storeRefreshToken(user.id, tokens.jti)

        return {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: userWithOutPassword as any,
        }
      } catch (error) {
        if (
          error instanceof ShardOwnershipNotFoundError ||
          error instanceof ShardUnavailableError ||
          error instanceof ShardSearchIncompleteError ||
          error instanceof CrossShardTimeoutError ||
          error instanceof CrossShardOverloadedError
        ) {
          throw error
        }
        console.error('Google Login Error:', error)
        throw new AuthenticationError('Google authentication failed')
      }
    },

    forgotPassword: async (_parent, { email }) => {
      const { data: user } = await sharding.findAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({ where: { email } })
      })

      if (user) {
        const client = await sharding.resolveShard(user.ownerId || user.id)
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const passwordReset: PasswordResetSettings = { token, expiresAt }

        await client.user.update({
          where: { id: user.id },
          data: { passwordReset: passwordReset as any },
        })

        await cache.invalidateUser(user.id)
        sendEmail(
          user.email,
          `Reset Your Password - ${APP_NAME}`,
          getResetPasswordEmailTemplate({ token, name: user.username })
        )
      }

      return true
    },

    resetPassword: async (_parent, { token, password }) => {
      const { data: user } = await sharding.findAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({
          where: { passwordReset: { path: ['token'], equals: token } },
        })
      })

      const passwordReset = user?.passwordReset as PasswordResetSettings | null | undefined

      if (!user || !passwordReset || new Date(passwordReset.expiresAt) < new Date()) {
        throw new ValidationError('Invalid or expired token')
      }

      const client = await sharding.resolveShard(user.ownerId || user.id)
      const hashedPassword = await hashPassword(password)

      await client.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, passwordReset: Prisma.JsonNull },
      })

      await cache.invalidateUser(user.id)
      return true
    },
  },
}
