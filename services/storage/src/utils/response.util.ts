import { Response } from 'express'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): Response => {
  return res.status(statusCode).json({
    success: true,
    data,
  } as ApiResponse<T>)
}

export const sendError = (res: Response, message: string, statusCode = 400): Response => {
  return res.status(statusCode).json({
    success: false,
    error: message,
  } as ApiResponse)
}

export const sendCreated = <T>(res: Response, data: T): Response => {
  return sendSuccess(res, data, 201)
}

export const sendNoContent = (res: Response): Response => {
  return res.status(204).send()
}
