import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import {
  STORAGE_SERVICE_TOKEN_SECRET,
  STORAGE_SERVICE_TOKEN_ISSUER,
  STORAGE_SERVICE_TOKEN_AUDIENCE,
  STORAGE_SERVICE_TOKEN_TYPE,
  FILE_VIEW_TOKEN_TYPE,
  JWT_ALGORITHM,
} from '../constants/index.js'
import type { AuthUser, RequestContext } from '../types/index.js'
import { sendError } from '../utils/response.util.js'

declare global {
  namespace Express {
    interface Request {
      context: RequestContext
      fileView?: { fileId: string; ownerId: string }
    }
  }
}

/** Internal service auth: Authorization Bearer only — never cookies or query strings. */
export function extractServiceBearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || typeof header !== 'string') return null
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

export function verifyStorageServiceToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, STORAGE_SERVICE_TOKEN_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: STORAGE_SERVICE_TOKEN_ISSUER,
      audience: STORAGE_SERVICE_TOKEN_AUDIENCE,
    }) as {
      _id: string
      email?: string
      role?: string
      tokenType?: string
    }

    if (decoded.tokenType !== STORAGE_SERVICE_TOKEN_TYPE || !decoded._id) {
      return null
    }

    return {
      id: decoded._id,
      email: decoded.email || '',
      role: decoded.role || 'USER',
    }
  } catch {
    return null
  }
}

export function verifyFileViewToken(
  token: string
): { fileId: string; ownerId: string } | null {
  try {
    const decoded = jwt.verify(token, STORAGE_SERVICE_TOKEN_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: STORAGE_SERVICE_TOKEN_ISSUER,
      audience: STORAGE_SERVICE_TOKEN_AUDIENCE,
    }) as {
      fileId?: string
      ownerId?: string
      tokenType?: string
    }

    if (
      decoded.tokenType !== FILE_VIEW_TOKEN_TYPE ||
      !decoded.fileId ||
      !decoded.ownerId
    ) {
      return null
    }
    return { fileId: decoded.fileId, ownerId: decoded.ownerId }
  } catch {
    return null
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractServiceBearerToken(req)

  if (!token) {
    req.context = {
      user: null,
      isAuthenticated: false,
    }
    next()
    return
  }

  const user = verifyStorageServiceToken(token)
  if (!user) {
    req.context = {
      user: null,
      isAuthenticated: false,
    }
    next()
    return
  }

  req.context = {
    user,
    isAuthenticated: true,
  }
  next()
}

/**
 * Optional query-token auth for file content URLs only.
 * Accepts purpose-limited file-view tokens — never storage-service tokens.
 */
export const fileViewQueryAuth = (req: Request, res: Response, next: NextFunction): void => {
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null
  if (!queryToken) {
    next()
    return
  }

  // Reject internal service tokens in URLs even if present
  if (verifyStorageServiceToken(queryToken)) {
    res.status(401).send('Service tokens must not be passed in URLs')
    return
  }

  const view = verifyFileViewToken(queryToken)
  if (!view) {
    next()
    return
  }

  req.fileView = view
  req.context = {
    user: { id: view.ownerId, email: '', role: 'USER' },
    isAuthenticated: true,
  }
  next()
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.context?.isAuthenticated || !req.context?.user) {
    sendError(res, 'Authentication required', 401)
    return
  }
  next()
}

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context?.user) {
      sendError(res, 'Authentication required', 401)
      return
    }

    if (!roles.includes(req.context.user.role)) {
      sendError(res, 'Insufficient permissions', 403)
      return
    }

    next()
  }
}
