import { APP_NAME } from '@/constants'
import { findUserAcrossShards, sharding } from '@/config/prisma'
import { OtpSettings, PasswordResetSettings } from '../types/db.types'
import { authLite } from '@/config/authlite'
import { Prisma } from '@prisma/client'
import { sendEmail } from '@/utils/email.util'
import { Context } from '@/types/context.type'
import { Resolvers } from '@/types/types.generated'
import { AuthenticationError, ValidationError } from '@/errors'
import { hashPassword, comparePassword, generateToken } from '../utils/auth.utils'
import { getOtpEmailTemplate } from '@/templates/otp-email.template'
import { getResetPasswordEmailTemplate } from '@/templates/reset-password.template'
import { cache } from '@/cache'
import crypto from 'crypto'

export const authResolver: Resolvers<Context> = {
  Mutation: {
    signup: async (_parent, { data }) => {
      const { email, username, password } = data

      const { result: existingUser } = await findUserAcrossShards(async (client) => {
        return client.user.findFirst({
          omit: { password: true },
          where: { OR: [{ email }, { username }] },
        })
      })

      if (existingUser) {
        throw new ValidationError('Email or username already in use')
      }

      const hashedPassword = await hashPassword(password)

      const shardClient = sharding.getRandomShard()

      const user = await shardClient.user.create({
        omit: { password: true },
        data: {
          email,
          username,
          password: hashedPassword,
        },
      })

      const token = generateToken({
        _id: user.id,
        email: user.email,
      })

      return { token, user }
    },

    login: async (_parent, { data }) => {
      const { email, password } = data

      const { result: user, client } = await findUserAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({
          where: { email },
        })
      })

      if (!user || !client) {
        throw new AuthenticationError('Invalid email or password')
      }

      if (!user.password) {
        throw new AuthenticationError('Invalid login method. Try Google Login.')
      }

      const isValid = await comparePassword(password, user.password)
      if (!isValid) {
        throw new AuthenticationError('Invalid email or password')
      }

      const { password: _, ...userWithOutPassword } = user
      const mfaSettings = user.mfaSettings

      if (mfaSettings?.isEnabled) {
        if (mfaSettings.method === 'EMAIL') {
          const otp = Math.floor(100000 + Math.random() * 900000).toString()
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

          const otpSettings: OtpSettings = {
            code: otp,
            expiresAt,
          }

          await client.user.update({
            where: { id: user.id },
            data: {
              otp: otpSettings as any,
            },
          })

          await cache.invalidateUser(user.id)

          await sendEmail(
            user.email,
            `Your Login OTP for ${APP_NAME}`,
            getOtpEmailTemplate({ otp })
          )
        }

        const tempToken = generateToken({
          _id: user.id,
          email: user.email,
          is2faPending: true,
        })

        return { token: tempToken, user: userWithOutPassword }
      }

      const token = generateToken({
        _id: user.id,
        email: user.email,
      })

      return { token, user: userWithOutPassword }
    },

    googleLogin: async (_parent, { token }) => {
      try {
        const googleUser = await authLite.google.verify(token, 'web')

        let { result: user, client } = await findUserAcrossShards(async (shardClient) => {
          return shardClient.user.findFirst({
            where: { email: googleUser.email },
          })
        })

        if (!user) {
          const randomPassword =
            Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10)
          const hashedPassword = await hashPassword(randomPassword)

          client = sharding.getRandomShard()

          user = await client.user.create({
            data: {
              email: googleUser.email,
              username: googleUser.name || googleUser.email.split('@')[0],
              password: hashedPassword,
              googleId: googleUser.googleId,
            },
          })
        } else {
          if (!user.googleId && client) {
            user = await client.user.update({
              where: { id: user.id },
              data: { googleId: googleUser.googleId },
            })

            await cache.invalidateUser(user.id)
          }
        }

        if (!client) {
          throw new AuthenticationError('Failed to determine user shard')
        }

        const { password: _, ...userWithOutPassword } = user
        const mfaSettings = user.mfaSettings

        if (mfaSettings?.isEnabled) {
          if (mfaSettings.method === 'EMAIL') {
            const otp = Math.floor(100000 + Math.random() * 900000).toString()
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

            const otpSettings: OtpSettings = {
              code: otp,
              expiresAt,
            }

            await client.user.update({
              where: { id: user.id },
              data: { otp: otpSettings as any },
            })

            await cache.invalidateUser(user.id)

            sendEmail(user.email, `Your Login OTP for ${APP_NAME}`, getOtpEmailTemplate({ otp }))
          }

          const tempToken = generateToken({
            _id: user.id,
            email: user.email,
            is2faPending: true,
          })

          return { token: tempToken, user: userWithOutPassword }
        }

        const jwt = generateToken({ _id: user.id, email: user.email })
        return { token: jwt, user: userWithOutPassword }
      } catch (error) {
        console.error('Google Login Error:', error)
        throw new AuthenticationError('Google authentication failed')
      }
    },

    forgotPassword: async (_parent, { email }) => {
      const { result: user, client } = await findUserAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({ where: { email } })
      })

      if (user && client) {
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

        const passwordReset: PasswordResetSettings = {
          token,
          expiresAt,
        }

        await client.user.update({
          where: { id: user.id },
          data: {
            passwordReset: passwordReset as any,
          },
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
      const { result: user, client } = await findUserAcrossShards(async (shardClient) => {
        return shardClient.user.findFirst({
          where: {
            passwordReset: {
              path: ['token'],
              equals: token,
            },
          },
        })
      })

      const passwordReset = user?.passwordReset

      if (!user || !client || !passwordReset || new Date(passwordReset.expiresAt) < new Date()) {
        throw new ValidationError('Invalid or expired token')
      }

      const hashedPassword = await hashPassword(password)

      await client.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordReset: Prisma.JsonNull,
        },
      })

      await cache.invalidateUser(user.id)

      return true
    },
  },
}
