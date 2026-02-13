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

// NEW: Configurable URL Masking
// true = Proxy through backend (Masked)
// false = Direct provider URL (S3/Cloudinary)
export const FILE_PROXY_MODE = process.env.FILE_PROXY_MODE === 'true'

// CORS: Comma-separated allowed origins (e.g., "https://app.example.com,https://admin.example.com")
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || ''

// Stream proxy timeout in milliseconds (default: 30 seconds)
export const STREAM_TIMEOUT_MS = parseInt(process.env.STREAM_TIMEOUT_MS || '30000', 10)

// Proxy token expiry (default: 15 minutes)
export const PROXY_TOKEN_EXPIRY = process.env.PROXY_TOKEN_EXPIRY || '15m'
