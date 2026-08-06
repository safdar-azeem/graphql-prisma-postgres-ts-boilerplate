import type { CorsOptions } from 'cors'
import { IS_DEVELOPMENT, CORS_ALLOWED_ORIGINS } from '../constants/index.js'

export function parseAllowedOrigins(raw: string): string[] {
  const origins = new Set<string>()
  if (raw) {
    raw.split(',').forEach((origin) => {
      if (origin.trim()) origins.add(origin.trim())
    })
  }
  return Array.from(origins)
}

/** Exact origin match only — never prefix/suffix string matching. */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  options?: { development?: boolean }
): boolean {
  if (options?.development) return true
  if (!origin) return true
  return allowedOrigins.includes(origin)
}

export function getCorsOptions(): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(CORS_ALLOWED_ORIGINS)

  if (IS_DEVELOPMENT) {
    return { origin: true, credentials: true }
  }

  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, allowedOrigins, { development: false })) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS policy'), false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Share-Password'],
  }
}
