export const NODE_ENV = process.env.NODE_ENV || 'development'
export const IS_PRODUCTION = NODE_ENV === 'production'
export const IS_DEVELOPMENT = NODE_ENV === 'development'

/** Align with main API STORAGE_SERVICE_URL default (4201). */
export const PORT = parseInt(process.env.PORT || '4201', 10)

export const STORAGE_SERVICE_TOKEN_SECRET = process.env.STORAGE_SERVICE_TOKEN_SECRET || ''
export const STORAGE_SERVICE_TOKEN_ISSUER =
  process.env.STORAGE_SERVICE_TOKEN_ISSUER || 'boilerplate-storage'
export const STORAGE_SERVICE_TOKEN_AUDIENCE =
  process.env.STORAGE_SERVICE_TOKEN_AUDIENCE || 'boilerplate-storage-service'
export const STORAGE_SERVICE_TOKEN_TYPE = 'storage-service' as const
export const FILE_VIEW_TOKEN_TYPE = 'file-view' as const
export const JWT_ALGORITHM = 'HS256' as const

export const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local') as
  | 's3'
  | 'cloudinary'
  | 'imagekit'
  | 'local'
  | 'obs'

/** Default true — mask provider URLs through this service. */
export const FILE_PROXY_MODE = process.env.FILE_PROXY_MODE !== 'false'

export const SIGNED_URL_EXPIRY_SECONDS = parseInt(
  process.env.SIGNED_URL_EXPIRY_SECONDS || '3600',
  10
)

export const PENDING_FILE_CLEANUP_HOURS = parseInt(
  process.env.PENDING_FILE_CLEANUP_HOURS || '24',
  10
)

export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || ''

export const STREAM_TIMEOUT_MS = parseInt(process.env.STREAM_TIMEOUT_MS || '30000', 10)

export const PROXY_TOKEN_EXPIRY = process.env.PROXY_TOKEN_EXPIRY || '15m'

/** Fail startup when storage-service secrets are missing or weak. */
export function validateStorageSecrets(): void {
  if (!process.env.STORAGE_SERVICE_TOKEN_SECRET) {
    if (process.env.JWT_SECRET) {
      throw new Error(
        'Legacy JWT_SECRET fallback is not supported. Set STORAGE_SERVICE_TOKEN_SECRET explicitly.'
      )
    }
    throw new Error('STORAGE_SERVICE_TOKEN_SECRET is required and must be a non-empty string')
  }

  const secret = process.env.STORAGE_SERVICE_TOKEN_SECRET
  if (secret.length < 32) {
    throw new Error('STORAGE_SERVICE_TOKEN_SECRET must be at least 32 characters')
  }
  if (secret === 'change-this-to-a-secure-secret-in-production') {
    throw new Error('STORAGE_SERVICE_TOKEN_SECRET must be changed from the default example value')
  }
}
