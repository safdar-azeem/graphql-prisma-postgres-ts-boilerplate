import { Prisma } from '@prisma/client'
import { authLite } from '@/config/authlite'
import { cache } from '@/cache'
import { APP_NAME } from '@/constants'
import { AuthenticationError, ValidationError } from '@/errors'
import { sendEmail } from '@/utils/email.util'
import { getOtpEmailTemplate } from '@/templates/otp-email.template'
import { generateOtp } from '@/utils/otp.util'
import { hashToken } from '@/config/tokens'
import type { PrismaClient } from '@prisma/client'
import { comparePassword, getPasswordHash } from './auth.service'
import type { OtpSettings } from '../types/db.types'

export async function init2faEnrollment(
  client: PrismaClient,
  user: { id: string; email: string; mfaSettings?: any },
  method: 'EMAIL' | 'AUTHENTICATOR'
) {
  const mfaSettings = user.mfaSettings
  if (mfaSettings?.isEnabled) {
    throw new ValidationError('MFA is already enabled')
  }

  if (method === 'EMAIL') {
    const { otp, expiresAt } = generateOtp()
    const otpSettings: OtpSettings = {
      codeHash: hashToken(otp),
      expiresAt,
      attempts: 0,
    }

    await client.user.update({
      where: { id: user.id },
      data: {
        mfaSettings: {
          isEnabled: false,
          method,
          secret: 'EMAIL_MODE',
          backupCodes: [],
        },
        otp: otpSettings as any,
      },
    })

    await cache.invalidateUser(user.id)
    await sendEmail(
      user.email,
      `Confirm 2FA Enrollment - ${APP_NAME}`,
      getOtpEmailTemplate({ otp })
    )

    return { secret: 'EMAIL_MODE', qrCode: '', backupCodes: [] as string[] }
  }

  const { encryptedSecret, qrCode, backupCodes } = await authLite.mfa.createEnrollment(user.email)
  const hashedBackupCodes = (backupCodes || []).map((c: string) => hashToken(c))

  await client.user.update({
    where: { id: user.id },
    data: {
      mfaSettings: {
        isEnabled: false,
        method,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
      },
    },
  })

  await cache.invalidateUser(user.id)

  // Return raw backup codes once; only hashes are stored
  return { secret: encryptedSecret, qrCode, backupCodes }
}

export async function confirm2faEnrollment(
  client: PrismaClient,
  user: { id: string; mfaSettings?: any; otp?: any },
  otp: string
) {
  const mfaSettings = user.mfaSettings

  if (mfaSettings?.method === 'AUTHENTICATOR') {
    if (!mfaSettings.secret) throw new ValidationError('MFA not initialized')
    const isValid = authLite.mfa.verifyTotp({ token: otp, secret: mfaSettings.secret })
    if (!isValid) throw new ValidationError('Invalid OTP code')

    await client.user.update({
      where: { id: user.id },
      data: { mfaSettings: { ...mfaSettings, isEnabled: true } },
    })
    await cache.invalidateUser(user.id)
    return true
  }

  if (mfaSettings?.method === 'EMAIL') {
    const otpSettings = user.otp as OtpSettings | null
    if (!otpSettings?.codeHash || !otpSettings?.expiresAt) {
      throw new ValidationError('No OTP found. Please request a new one.')
    }

    const now = new Date()
    const expires = new Date(otpSettings.expiresAt)
    if (otpSettings.codeHash !== hashToken(otp) || expires < now) {
      throw new ValidationError('Invalid or expired OTP')
    }

    await client.user.update({
      where: { id: user.id },
      data: {
        mfaSettings: { ...mfaSettings, isEnabled: true },
        otp: Prisma.DbNull,
      },
    })
    await cache.invalidateUser(user.id)
    return true
  }

  return false
}

export async function disable2fa(client: PrismaClient, userId: string, password: string) {
  if (!password) {
    throw new AuthenticationError('Password is required')
  }

  const hash = await getPasswordHash(client, userId)
  if (!hash) throw new AuthenticationError('Invalid password')

  const isValid = await comparePassword(password, hash)
  if (!isValid) throw new AuthenticationError('Invalid password')

  await client.user.update({
    where: { id: userId },
    data: {
      mfaSettings: { isEnabled: false },
      otp: Prisma.DbNull,
    },
  })
  await cache.invalidateUser(userId)
  return true
}
