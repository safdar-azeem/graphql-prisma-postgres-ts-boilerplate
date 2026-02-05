import { Request, Response, NextFunction } from 'express'
import { IS_DEVELOPMENT } from '../constants/index.js'
import { sendError } from '../utils/response.util.js'

interface CustomError extends Error {
  statusCode?: number
  code?: string
}

export const errorMiddleware = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  if (IS_DEVELOPMENT) {
    console.error('[Error]', {
      message: err.message,
      stack: err.stack,
      code: err.code,
    })
  }

  if (statusCode === 500 && !IS_DEVELOPMENT) {
    sendError(res, 'An unexpected error occurred', 500)
    return
  }

  sendError(res, message, statusCode)
}

export const notFoundMiddleware = (_req: Request, res: Response): void => {
  sendError(res, 'Resource not found', 404)
}
