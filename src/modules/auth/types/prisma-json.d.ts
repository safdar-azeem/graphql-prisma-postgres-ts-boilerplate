import { MfaSettings, OtpSettings } from './db.types'

declare global {
  namespace PrismaJson {
    type MfaSettingsType = MfaSettings
    type OtpSettingsType = OtpSettings
  }
}
