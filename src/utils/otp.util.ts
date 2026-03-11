import crypto from 'crypto'

export interface OtpResult {
  otp: string
  expiresAt: string
}

/**
 * Generates a 6-digit OTP with a 5-minute expiry.
 */
export const generateOtp = (): OtpResult => {
  const otp = crypto.randomInt(100000, 1000000).toString()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  return { otp, expiresAt }
}
