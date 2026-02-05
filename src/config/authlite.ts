import { AuthLite } from 'authlite'
import { APP_NAME } from '@/constants'

if (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.length !== 32) {
  throw new Error('MFA_ENCRYPTION_KEY must be exactly 32 characters')
}

export const authLite = new AuthLite({
  appName: APP_NAME,
  encryptionKey: process.env.MFA_ENCRYPTION_KEY,
  google: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
  },
})
