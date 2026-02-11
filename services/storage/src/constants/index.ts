export const NODE_ENV = process.env.NODE_ENV || 'development'
export const IS_PRODUCTION = NODE_ENV === 'production'
export const IS_DEVELOPMENT = NODE_ENV === 'development'

export const PORT = parseInt(process.env.PORT || '4201', 10)
export const JWT_SECRET = process.env.JWT_SECRET as string

export const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local') as
  | 's3'
  | 'cloudinary'
  | 'imagekit'
  | 'local'

export const SIGNED_URL_EXPIRY_SECONDS = parseInt(
  process.env.SIGNED_URL_EXPIRY_SECONDS || '3600',
  10
)

export const PENDING_FILE_CLEANUP_HOURS = parseInt(
  process.env.PENDING_FILE_CLEANUP_HOURS || '24',
  10
)
