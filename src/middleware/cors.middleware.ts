import { Request, Response, NextFunction } from 'express'
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

const shouldAllowRequest = (req: Request): boolean => {
  const origin = req.headers.origin

  // Always allow in development
  if (IS_DEVELOPMENT) {
    return true
  }

  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, direct browser navigation)
  if (!origin) {
    return true
  }

  // Check if origin is explicitly allowed
  return allowedOrigins.some((allowed) => origin === allowed || origin.startsWith(allowed))
}

export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin
  const userAgent = req.headers['user-agent']

  if (shouldAllowRequest(req)) {
    // Important: Set CORS headers so the browser accepts the response
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    // Handle Preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, token, X-Requested-With'
      )
      res.status(200).end()
      return
    }

    res.setHeader('Vary', 'Origin')
    next()
  } else {
    res.status(403).json({
      error: 'Not allowed by CORS policy',
      origin: origin || 'undefined',
      userAgent: userAgent,
    })
  }
}
