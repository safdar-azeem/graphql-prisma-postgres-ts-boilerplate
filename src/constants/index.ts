export const NODE_ENV = process.env.NODE_ENV || 'development'

export const IS_PRODUCTION = NODE_ENV === 'production'
export const IS_DEVELOPMENT = NODE_ENV === 'development'

/** Structured logging: on by default; set ENABLE_LOGGER=false to disable. */
export const ENABLE_LOGGER = process.env.ENABLE_LOGGER !== 'false'

export const ACCESS_TOKEN_EXPIRES_IN = parseInt(
  process.env.ACCESS_TOKEN_EXPIRES_IN || String(15 * 60),
  10
)
export const REFRESH_TOKEN_EXPIRES_IN = parseInt(
  process.env.REFRESH_TOKEN_EXPIRES_IN || String(7 * 24 * 60 * 60),
  10
)

/** @deprecated Prefer ACCESS_TOKEN_EXPIRES_IN */
export const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '604800', 10)

const legacyJwt = process.env.JWT_SECRET || ''
const usedLegacyAccess = !process.env.ACCESS_TOKEN_SECRET && Boolean(legacyJwt)
const usedLegacyRefresh = !process.env.REFRESH_TOKEN_SECRET && Boolean(legacyJwt)

export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || legacyJwt
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || legacyJwt

export const JWT_ISSUER = process.env.JWT_ISSUER || 'boilerplate-api'
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'boilerplate-clients'
export const JWT_ALGORITHM = 'HS256' as const

/** Internal storage-service tokens — never the same as user access tokens. */
export const STORAGE_SERVICE_TOKEN_SECRET =
  process.env.STORAGE_SERVICE_TOKEN_SECRET || ''
export const STORAGE_SERVICE_TOKEN_ISSUER =
  process.env.STORAGE_SERVICE_TOKEN_ISSUER || 'boilerplate-storage'
export const STORAGE_SERVICE_TOKEN_AUDIENCE =
  process.env.STORAGE_SERVICE_TOKEN_AUDIENCE || 'boilerplate-storage-service'
export const STORAGE_SERVICE_TOKEN_EXPIRES_IN = parseInt(
  process.env.STORAGE_SERVICE_TOKEN_EXPIRES_IN || String(15 * 60),
  10
)

export const APP_NAME = process.env.APP_NAME || 'AppName'
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4202'
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || ''

export const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:4201'

export const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1'

/** Dashboard disabled by default — must be explicitly enabled. */
export const ENABLE_QUEUE_DASHBOARD = process.env.ENABLE_QUEUE_DASHBOARD === 'true'
export const QUEUE_DASHBOARD_TOKEN = process.env.QUEUE_DASHBOARD_TOKEN || ''

export const ALLOW_BATCHED_QUERIES = process.env.ALLOW_BATCHED_QUERIES === 'true'

/** Queues opt-in: must be explicitly enabled. */
export const ENABLE_QUEUES = process.env.ENABLE_QUEUES === 'true'

export const GRAPHQL_QUERY_DEPTH = parseInt(process.env.GRAPHQL_QUERY_DEPTH || '10', 10)

export const INSTANCE_ID = `app-${process.pid}-${Math.random().toString(36).substring(2, 8)}`

/** Fail startup when required secrets are missing or weak. */
export function validateRuntimeSecrets(): void {
  const check = (name: string, value: string, minLength = 32) => {
    if (!value || !value.trim()) {
      throw new Error(`${name} is required and must be a non-empty string`)
    }
    if (value.length < minLength) {
      throw new Error(`${name} must be at least ${minLength} characters`)
    }
    if (value === 'change-this-to-a-secure-secret-in-production') {
      throw new Error(`${name} must be changed from the default example value`)
    }
  }

  check('ACCESS_TOKEN_SECRET', ACCESS_TOKEN_SECRET)
  check('REFRESH_TOKEN_SECRET', REFRESH_TOKEN_SECRET)
  check('STORAGE_SERVICE_TOKEN_SECRET', STORAGE_SERVICE_TOKEN_SECRET)

  if (usedLegacyAccess || usedLegacyRefresh) {
    const msg =
      '[tokens] Legacy JWT_SECRET fallback is in use. Set ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET explicitly. Fallback is development-only and rejected in production.'
    if (IS_PRODUCTION) {
      throw new Error(msg)
    }
    console.warn(msg)
  }

  if (ACCESS_TOKEN_SECRET === REFRESH_TOKEN_SECRET) {
    const msg =
      'ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different values'
    if (IS_PRODUCTION) {
      throw new Error(msg)
    }
    console.warn(`[tokens] ${msg} (allowed only outside production during migration)`)
  }

  if (
    STORAGE_SERVICE_TOKEN_SECRET === ACCESS_TOKEN_SECRET ||
    STORAGE_SERVICE_TOKEN_SECRET === REFRESH_TOKEN_SECRET
  ) {
    throw new Error(
      'STORAGE_SERVICE_TOKEN_SECRET must be distinct from access and refresh token secrets'
    )
  }

  const mfaKey = process.env.MFA_ENCRYPTION_KEY || ''
  if (mfaKey.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must be exactly 32 characters')
  }
}
