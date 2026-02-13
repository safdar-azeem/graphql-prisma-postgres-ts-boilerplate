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
  let token = req.headers.authorization

  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7)
  }

  // Handle Cookies for seamless image loading (<img> tags)
  if (!token && req.cookies?.token) {
    token = req.cookies.token
  }
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken
  }

  // Handle query parameter (fallback)
  if (!token && req.query?.token) {
    token = req.query.token as string
  }

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
