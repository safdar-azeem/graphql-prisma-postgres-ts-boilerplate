import crypto from 'crypto'
import { Prisma, UserStatus, UserType, WorkspaceStatus, type PrismaClient } from '@prisma/client'
import { APP_NAME } from '@/constants'
import { assignWorkspaceShard, findUserAcrossShards, getDbForWorkspace } from '@/config/prisma'
import {
  generateAccessToken,
  generateTokenPair,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/config/tokens'
import { authLite } from '@/config/authlite'
import { cache } from '@/cache'
import {
  revokeAllRefreshTokens,
  revokeRefreshToken,
  storeRefreshToken,
  assertRotated,
} from '@/cache/refreshToken.cache'
import {
  AuthenticationError,
  ConflictError,
  DependencyUnavailableError,
  ValidationError,
  mapPrismaError,
} from '@/errors'
import { sendEmail } from '@/utils/email.util'
import { getOtpEmailTemplate } from '@/templates/otp-email.template'
import { getResetPasswordEmailTemplate } from '@/templates/reset-password.template'
import { generateOtp } from '@/utils/otp.util'
import { slugify, uniqueSlug } from '@/utils/slug.util'
import { ALL_PERMISSIONS } from '@/authorization/permissions'
import {
  activateAfterShardCommit,
  reserveEmail,
  releaseAfterFailedShardWrite,
} from '@/identity/email-reservation.service'
import { resolveUserByEmail } from '@/identity/resolve-user-by-email'
import { hashPassword, comparePassword } from '../utils/auth.utils'
import { OtpSettings, PasswordResetSettings } from '../types/db.types'
import {
  validateLoginInput,
  validateSignupInput,
  type LoginInput,
  type SignupInput,
} from '../validation/auth.schema'

type DbClient = PrismaClient

function stripPassword<T extends { password?: string }>(user: T) {
  const { password: _p, ...rest } = user
  return rest
}

async function issueAuthPayload(user: {
  id: string
  email: string
  userType: UserType
  workspaceId: string
  password?: string
}) {
  const tokens = generateTokenPair(user)
  await storeRefreshToken(user.id, tokens.jti)
  return {
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: stripPassword(user),
  }
}

async function maybeStartMfaChallenge(
  user: {
    id: string
    email: string
    userType: UserType
    workspaceId: string
    mfaSettings?: { isEnabled?: boolean; method?: string } | null
    password?: string
  },
  client: DbClient
) {
  const mfaSettings = user.mfaSettings
  if (!mfaSettings?.isEnabled) {
    return null
  }

  if (mfaSettings.method === 'EMAIL') {
    const { otp, expiresAt } = generateOtp()
    const otpSettings: OtpSettings = {
      codeHash: hashToken(otp),
      expiresAt,
      attempts: 0,
    }
    await client.user.update({
      where: { id: user.id },
      data: { otp: otpSettings as any },
    })
    await cache.invalidateUser(user.id)
    // Queue email — failures must not change public auth outcome
    void sendEmail(user.email, `Your Login OTP for ${APP_NAME}`, getOtpEmailTemplate({ otp })).catch(
      () => undefined
    )
  }

  const tempToken = generateAccessToken({
    _id: user.id,
    email: user.email,
    userType: user.userType,
    workspaceId: user.workspaceId,
    is2faPending: true,
  })

  return {
    token: tempToken,
    refreshToken: '',
    user: stripPassword(user),
  }
}

async function completePasswordLogin(
  user: {
    id: string
    email: string
    password: string
    userType: UserType
    workspaceId: string
    status: UserStatus
    mfaSettings?: any
  },
  client: DbClient,
  password: string
) {
  if (user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError('Invalid email or password')
  }

  const workspace = await client.workspace.findUnique({ where: { id: user.workspaceId } })
  if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new AuthenticationError('Invalid email or password')
  }

  if (!user.password) {
    throw new AuthenticationError('Invalid login method. Try Google Login.')
  }

  const isValid = await comparePassword(password, user.password)
  if (!isValid) {
    throw new AuthenticationError('Invalid email or password')
  }

  const mfaPayload = await maybeStartMfaChallenge(user, client)
  if (mfaPayload) return mfaPayload

  return issueAuthPayload(user)
}

export async function signup(data: SignupInput) {
  const input = validateSignupInput(data)

  const workspaceId = crypto.randomUUID()
  const ownerId = crypto.randomUUID()
  const { client, shardId } = assignWorkspaceShard(workspaceId)

  const baseSlug = input.workspaceSlug || slugify(input.workspaceName)
  let slug = uniqueSlug(baseSlug)

  await reserveEmail({
    email: input.email,
    userId: ownerId,
    workspaceId,
    shardId,
  })

  const slugClash = await client.workspace.findUnique({ where: { slug } })
  if (slugClash) {
    slug = uniqueSlug(baseSlug, crypto.randomBytes(3).toString('hex'))
  }

  const hashedPassword = await hashPassword(input.password)

  let owner
  try {
    owner = await client.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: input.workspaceName,
          slug,
          shardId,
        },
      })

      const createdOwner = await tx.user.create({
        data: {
          id: ownerId,
          email: input.email,
          username: input.username,
          password: hashedPassword,
          userType: UserType.OWNER,
          status: UserStatus.ACTIVE,
          workspaceId: workspace.id,
          emailVerified: false,
        },
      })

      await tx.workspace.update({
        where: { id: workspace.id },
        data: { ownerId: createdOwner.id },
      })

      await tx.role.create({
        data: {
          name: 'Admin',
          description: 'Default admin role with full member permissions',
          isSystem: true,
          workspaceId: workspace.id,
          permissions: [...ALL_PERMISSIONS],
        },
      })

      return createdOwner
    })
  } catch (error) {
    await releaseAfterFailedShardWrite(input.email, ownerId)
    const mapped = mapPrismaError(error)
    if (mapped) throw mapped
    throw error
  }

  // Shard commit succeeded — never release on activation failure
  await activateAfterShardCommit(input.email, ownerId)
  return issueAuthPayload(owner)
}

export async function login(data: LoginInput) {
  const input = validateLoginInput(data)

  const discovered = await resolveUserByEmail(input.email)

  if (!discovered.result || !discovered.client) {
    throw new AuthenticationError('Invalid email or password')
  }

  return completePasswordLogin(discovered.result as any, discovered.client, input.password)
}

export async function googleLogin(token: string) {
  try {
    const googleUser = await authLite.google.verify(token, 'web')
    const email = googleUser.email.trim().toLowerCase()

    let found = await resolveUserByEmail(email)

    let user = found.result
    let client = found.client

    if (!user) {
      const workspaceId = crypto.randomUUID()
      const ownerId = crypto.randomUUID()
      const assigned = assignWorkspaceShard(workspaceId)
      client = assigned.client

      const randomPassword = crypto.randomBytes(24).toString('hex')
      const hashedPassword = await hashPassword(randomPassword)
      const slug = uniqueSlug(email.split('@')[0], crypto.randomBytes(2).toString('hex'))

      await reserveEmail({
        email,
        userId: ownerId,
        workspaceId,
        shardId: assigned.shardId,
      })
      try {
        user = await client.$transaction(async (tx) => {
          const workspace = await tx.workspace.create({
            data: {
              id: workspaceId,
              name: `${googleUser.name || 'My'} Workspace`,
              slug,
              shardId: assigned.shardId,
            },
          })

          const owner = await tx.user.create({
            data: {
              id: ownerId,
              email,
              username: googleUser.name || email.split('@')[0],
              password: hashedPassword,
              googleId: googleUser.googleId,
              userType: UserType.OWNER,
              status: UserStatus.ACTIVE,
              workspaceId: workspace.id,
              emailVerified: true,
            },
          })

          await tx.workspace.update({
            where: { id: workspace.id },
            data: { ownerId: owner.id },
          })

          await tx.role.create({
            data: {
              name: 'Admin',
              description: 'Default admin role with full member permissions',
              isSystem: true,
              workspaceId: workspace.id,
              permissions: [...ALL_PERMISSIONS],
            },
          })

          return owner
        })
      } catch (error) {
        await releaseAfterFailedShardWrite(email, ownerId)
        throw error
      }
      await activateAfterShardCommit(email, ownerId)
    } else if (!user.googleId && client) {
      user = await client.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId },
      })
      await cache.invalidateUser(user.id)
    }

    if (!user || !client) {
      throw new AuthenticationError('Google authentication failed')
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AuthenticationError('Google authentication failed')
    }

    const workspace = await client.workspace.findUnique({ where: { id: user.workspaceId } })
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new AuthenticationError('Google authentication failed')
    }

    const mfaPayload = await maybeStartMfaChallenge(user as any, client)
    if (mfaPayload) return mfaPayload

    return issueAuthPayload(user as any)
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof DependencyUnavailableError
    ) {
      throw error
    }
    throw new AuthenticationError('Google authentication failed')
  }
}

export async function forgotPassword(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase()

  // Always return true — never leak existence via sync failures
  try {
    const found = await resolveUserByEmail(email)

    if (found.result && found.client) {
      const rawToken = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const passwordReset: PasswordResetSettings = {
        tokenHash: hashToken(rawToken),
        expiresAt,
      }

      await found.client.user.update({
        where: { id: found.result.id },
        data: { passwordReset: passwordReset as any },
      })

      await cache.invalidateUser(found.result.id)
      void sendEmail(
        found.result.email,
        `Reset Your Password - ${APP_NAME}`,
        getResetPasswordEmailTemplate({ token: rawToken, name: found.result.username })
      ).catch(() => undefined)
    }
  } catch {
    // Swallow — public response must be identical
  }

  return true
}

export async function resetPassword(rawToken: string, password: string) {
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }

  const tokenHash = hashToken(rawToken)
  const found = await findUserAcrossShards(async (shardClient) => {
    return shardClient.user.findFirst({
      where: { passwordReset: { path: ['tokenHash'], equals: tokenHash } },
    })
  })

  const passwordReset = found.result?.passwordReset as PasswordResetSettings | null | undefined

  if (
    !found.result ||
    !found.client ||
    !passwordReset ||
    new Date(passwordReset.expiresAt) < new Date()
  ) {
    throw new ValidationError('Invalid or expired token')
  }

  const hashedPassword = await hashPassword(password)

  await found.client.user.update({
    where: { id: found.result.id },
    data: { password: hashedPassword, passwordReset: Prisma.JsonNull },
  })

  await revokeAllRefreshTokens(found.result.id)
  await cache.invalidateUser(found.result.id)
  return true
}

export async function refreshTokens(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken)

  if (!decoded || !decoded.jti || !decoded.sub) {
    throw new AuthenticationError('Invalid refresh token')
  }

  // Verify user + workspace BEFORE consuming the refresh token
  const found = await findUserAcrossShards(async (client) => {
    return client.user.findUnique({
      where: { id: decoded.sub },
      include: { workspace: { select: { status: true, shardId: true } } },
    })
  })

  if (!found.result || found.result.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError('Invalid refresh token')
  }

  const workspace = (found.result as any).workspace
  if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new AuthenticationError('Invalid refresh token')
  }

  // Bind to persisted shard
  getDbForWorkspace({
    workspaceId: found.result.workspaceId,
    shardId: workspace.shardId,
  })

  const tokens = generateTokenPair(found.result as any)
  await assertRotated(decoded.sub, decoded.jti, tokens.jti)

  return {
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: stripPassword(found.result as any),
  }
}

export async function logout(userId: string, refreshToken?: string | null) {
  if (refreshToken) {
    const decoded = verifyRefreshToken(refreshToken)
    if (decoded?.jti && decoded.sub === userId) {
      await revokeRefreshToken(userId, decoded.jti)
    }
  }
  return true
}

export async function logoutAll(userId: string) {
  await revokeAllRefreshTokens(userId)
  return true
}

export async function verify2FA(token: string, otp: string) {
  const bearerToken = token ? token.replace('Bearer ', '') : null
  if (!bearerToken) {
    throw new AuthenticationError('Authentication token must be provided')
  }

  const decoded = verifyAccessToken(bearerToken)
  if (!decoded?._id || !decoded.is2faPending) {
    throw new AuthenticationError('Invalid or expired MFA challenge token')
  }

  const found = await findUserAcrossShards(async (shardClient) => {
    return shardClient.user.findUnique({
      where: { id: decoded._id },
      include: { workspace: { select: { status: true, shardId: true, id: true } } },
    })
  })

  if (!found.result || !found.client) {
    throw new AuthenticationError('Account Not Found')
  }

  const user = found.result as any
  const client = found.client

  if (user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError('Account is not active')
  }

  if (!user.workspace || user.workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new AuthenticationError('Workspace is not active')
  }

  if (decoded.workspaceId && decoded.workspaceId !== user.workspaceId) {
    throw new AuthenticationError('Invalid MFA challenge token')
  }

  // Ensure persisted shard
  getDbForWorkspace({
    workspaceId: user.workspaceId,
    shardId: user.workspace.shardId,
  })

  const mfaSettings = user.mfaSettings
  if (!mfaSettings?.isEnabled) {
    throw new AuthenticationError('MFA is not enabled for this account')
  }

  let isValid = false
  const MAX_OTP_ATTEMPTS = 5

  if (mfaSettings.method === 'AUTHENTICATOR') {
    if (mfaSettings.secret) {
      isValid = authLite.mfa.verifyTotp({ token: otp, secret: mfaSettings.secret })
    }
  } else if (mfaSettings.method === 'EMAIL') {
    const otpSettings = user.otp as OtpSettings | null
    if (otpSettings?.codeHash && otpSettings.expiresAt) {
      const attempts = otpSettings.attempts || 0
      if (attempts >= MAX_OTP_ATTEMPTS) {
        throw new AuthenticationError('Too many invalid OTP attempts')
      }
      const now = new Date()
      const expires = new Date(otpSettings.expiresAt)
      if (otpSettings.codeHash === hashToken(otp) && expires > now) {
        isValid = true
        await client.user.update({
          where: { id: user.id },
          data: { otp: Prisma.DbNull },
        })
        await cache.invalidateUser(user.id)
      } else {
        await client.user.update({
          where: { id: user.id },
          data: {
            otp: {
              ...otpSettings,
              attempts: attempts + 1,
            } as any,
          },
        })
      }
    }
  }

  // Backup codes — hashes only
  if (!isValid && mfaSettings.backupCodes?.length) {
    const otpHash = hashToken(otp)
    const idx = mfaSettings.backupCodes.findIndex((c: string) => c === otpHash)
    if (idx >= 0) {
      isValid = true
      const nextCodes = [...mfaSettings.backupCodes]
      nextCodes.splice(idx, 1)
      await client.user.update({
        where: { id: user.id },
        data: {
          mfaSettings: {
            ...mfaSettings,
            backupCodes: nextCodes,
          } as any,
        },
      })
      await cache.invalidateUser(user.id)
    }
  }

  if (!isValid) throw new AuthenticationError('Invalid or expired 2FA code')

  return issueAuthPayload(user)
}

export async function getPasswordHash(client: DbClient, userId: string): Promise<string | null> {
  const row = await client.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  return row?.password ?? null
}

export { comparePassword, hashPassword }
