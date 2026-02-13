import { FastifyCorsOptions } from '@fastify/cors'
import { IS_DEVELOPMENT, FRONTEND_URL, CORS_ALLOWED_ORIGINS } from '../constants'

// Helper to parse allowed origins
const getAllowedOrigins = (): string[] => {
  const origins = new Set<string>()

  // 1. Existing hardcoded domains logic
  const hardcodedDomains = ['myapp.com'].flatMap((domain) => [
    `https://${domain}`,
    `https://app.${domain}`,
  ])
  hardcodedDomains.forEach((origin) => origins.add(origin))

  // 2. Add FRONTEND_URL
  if (FRONTEND_URL) {
    origins.add(FRONTEND_URL)
  }

  // 3. Add origins from CORS_ALLOWED_ORIGINS env var (comma separated)
  if (CORS_ALLOWED_ORIGINS) {
    CORS_ALLOWED_ORIGINS.split(',').forEach((origin) => {
      if (origin.trim()) origins.add(origin.trim())
    })
  }

  return Array.from(origins)
}

const allowedOrigins = getAllowedOrigins()

const shouldAllowOrigin = (origin: string | undefined): boolean => {
  // Always allow in development
  if (IS_DEVELOPMENT) {
    return true
  }

  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, direct browser navigation)
  if (!origin) {
    return true
  }

  // Check if origin is explicitly allowed
  return allowedOrigins.some((allowed) => origin === allowed)
}

/**
 * Get CORS configuration options for Fastify
 */

export const getCorsOptions = (): FastifyCorsOptions => {
  const options: FastifyCorsOptions = {
    origin: IS_DEVELOPMENT
      ? true
      : (origin, callback) => {
          if (shouldAllowOrigin(origin)) {
            callback(null, true)
          } else {
            callback(new Error('Not allowed by CORS policy'), false)
          }
        },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  }

  // In production, enforce strict allowed headers
  if (!IS_DEVELOPMENT) {
    options.allowedHeaders = ['Content-Type', 'Authorization', 'token', 'X-Requested-With']
  }

  return options
}
