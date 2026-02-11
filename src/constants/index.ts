export const NODE_ENV = process.env.NODE_ENV || 'development'

export const IS_PRODUCTION = NODE_ENV === 'production'
export const IS_DEVELOPMENT = NODE_ENV === 'development'
export const ENABLE_LOGER = false

export const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '604800', 10)

export const JWT_SECRET = process.env.JWT_SECRET as string
export const APP_NAME = 'Builto'
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || ''

export const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:4201'

// Unique instance ID for this server replica
export const INSTANCE_ID = `app-${process.pid}-${Math.random().toString(36).substring(2, 8)}`
