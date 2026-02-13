import { MfaSettings, OtpSettings, PasswordResetSettings } from './db.types'

declare global {
	namespace PrismaJson {
		type MfaSettingsType = MfaSettings
		type OtpSettingsType = OtpSettings
		type PasswordResetSettingsType = PasswordResetSettings
	}
}

