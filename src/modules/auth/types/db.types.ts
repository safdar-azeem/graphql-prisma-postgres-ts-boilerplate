import { MfaMethod } from '@prisma/client'

export interface MfaSettings {
  isEnabled: boolean
  method?: MfaMethod
  secret?: string
  /** SHA-256 hashed backup codes only */
  backupCodes?: string[]
}

export interface OtpSettings {
  /** SHA-256 hash of the OTP code */
  codeHash: string
  expiresAt: string
  attempts?: number
}

/** Password reset stores a hash of the token, never the raw token. */
export interface PasswordResetSettings {
  tokenHash: string
  expiresAt: string
}
