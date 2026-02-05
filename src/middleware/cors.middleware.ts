import { Request, Response, NextFunction } from 'express'
import { IS_DEVELOPMENT } from '../constants'

const allowedOrigins = ['myapp.com'].flatMap((domain) => [
  `https://${domain}`,
  `https://app.${domain}`,
])

const shouldAllowRequest = (req: Request): boolean => {
  const origin = req.headers.origin

  if (IS_DEVELOPMENT) {
    return true
  }

  if (origin) {
    const isAllowed = allowedOrigins.some((allowed) => origin.includes(allowed))
    if (isAllowed) {
      return true
    }
  }

  return false
}

export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin
  const userAgent = req.headers['user-agent']

  if (shouldAllowRequest(req)) {
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
