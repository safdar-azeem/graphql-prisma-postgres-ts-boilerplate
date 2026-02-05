import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../constants/index.js'
import type { AuthUser, RequestContext } from '../types/index.js'
import { sendError } from '../utils/response.util.js'

declare global {
  namespace Express {
    interface Request {
      context: RequestContext
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

  if (!token) {
    req.context = {
      user: null,
      isAuthenticated: false,
    }
    next()
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      _id: string
      email?: string
      role?: string
    }

    const user: AuthUser = {
      id: decoded._id,
      email: decoded.email || '',
      role: decoded.role || 'USER',
    }

    req.context = {
      user,
      isAuthenticated: true,
    }
    next()
  } catch {
    req.context = {
      user: null,
      isAuthenticated: false,
    }
    next()
  }
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
