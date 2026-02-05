import { MfaMethod } from '@prisma/client'

export interface MfaSettings {
  isEnabled: boolean
  method?: MfaMethod
  secret?: string
  backupCodes?: string[]
}

export interface OtpSettings {
  code: string
  expiresAt: string
}

export interface PasswordResetSettings {
  token: string
  expiresAt: string
}
