import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { requireAuth } from '../middleware/auth.middleware.js'
import { sendSuccess, sendNoContent } from '../utils/response.util.js'
import { prisma } from '../config/prisma.js'
import {
  getFileById,
  getFiles,
  getFileDownloadUrl,
  deleteFiles,
  toggleFilePublic,
  updateFile,
  getFileStream,
} from '../services/file.service.js'
import { STREAM_TIMEOUT_MS } from '../constants/index.js'

const router = Router()

interface FilesQuery {
  page?: string
  limit?: string
  search?: string
  uploadedBy?: string
  folderId?: string
  dateFrom?: string
  dateTo?: string
}

router.get(
  '/',
  requireAuth,
  async (
    req: Request<object, object, object, FilesQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.context.user!
      const { page, limit, search, uploadedBy, folderId, dateFrom, dateTo } = req.query

      // 1. Determine Target Owner
      let targetOwnerId = user.id
      if (user.role === 'ADMIN' && uploadedBy) {
        targetOwnerId = uploadedBy
      }

      let parsedFolderId: string | null | undefined = undefined
      if (folderId === 'null') {
        parsedFolderId = null
      } else if (typeof folderId === 'string') {
        parsedFolderId = folderId
      }

      const filter = {
        search: search || null,
        uploadedBy: user.role === 'ADMIN' ? uploadedBy || null : user.id,
        folderId: parsedFolderId,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
      }

      const pagination = {
        page: page ? parseInt(page) : 1,
        limit: limit ? Math.min(parseInt(limit), 100) : 10,
      }

      const result = await getFiles(targetOwnerId, filter, pagination)
      sendSuccess(res, result)
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/:id',
  requireAuth,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const ownerId = req.context.user!.id

      const file = await getFileById(id, ownerId)

      if (!file) {
        res.status(404).json({
          success: false,
          error: 'File not found',
        })
        return
      }

      sendSuccess(res, file)
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/:id/url',
  requireAuth,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const ownerId = req.context.user!.id

      const url = await getFileDownloadUrl(id, ownerId)
      sendSuccess(res, { url })
    } catch (error) {
      next(error)
    }
  }
)

// PROXY CONTENT ROUTE
router.get(
  '/:id/content',
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params

      const file = await prisma.file.findUnique({ where: { id } })
      if (!file || file.status !== 'UPLOADED') {
        res.status(404).send('File not found')
        return
      }

      // Authorization Logic
      if (!file.isPublic) {
        // Enforce Authentication
        if (!req.context?.isAuthenticated || !req.context?.user) {
          res.status(401).send('Authentication required')
          return
        }
        
        // Enforce Ownership or Admin Roles
        if (file.ownerId !== req.context.user.id && req.context.user.role !== 'ADMIN') {
          res.status(403).send('Access denied')
          return
        }
      }

      const { stream, mimeType, size, filename } = await getFileStream(id)

      const etag = `"${crypto.createHash('md5').update(`${id}-${size}`).digest('hex')}"`
      const ifNoneMatch = req.headers['if-none-match']
      
      if (ifNoneMatch === etag) {
        res.status(304).end()
        return
      }

      res.setHeader('Content-Type', mimeType)
      res.setHeader('Cache-Control', 'public, max-age=31536000') // Permanent cache allowed now since URL is static
      res.setHeader('ETag', etag)
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
      res.setHeader('X-Content-Type-Options', 'nosniff')

      const timer = setTimeout(() => {
        stream.destroy(new Error('Stream timeout'))
      }, STREAM_TIMEOUT_MS)

      stream.on('end', () => clearTimeout(timer))
      stream.on('error', () => clearTimeout(timer))

      await pipeline(stream, res)
    } catch (error) {
      console.error('Proxy Error:', error)
      if (!res.headersSent) {
        res.status(404).send('File not found')
      }
    }
  }
)

router.patch(
  '/:id',
  requireAuth,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const ownerId = req.context.user!.id
      const { isPublic } = req.body

      const file = await updateFile(id, ownerId, { isPublic })
      sendSuccess(res, file)
    } catch (error) {
      next(error)
    }
  }
)

router.patch(
  '/:id/toggle-public',
  requireAuth,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const ownerId = req.context.user!.id

      const file = await toggleFilePublic(id, ownerId)
      sendSuccess(res, file)
    } catch (error) {
      next(error)
    }
  }
)

router.delete(
  '/batch',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ids } = req.body
      const ownerId = req.context.user!.id

      if (!ids || !Array.isArray(ids)) {
        res.status(400).json({
          success: false,
          error: 'ids array is required',
        })
        return
      }

      const message = await deleteFiles(ids, ownerId)
      sendSuccess(res, { message })
    } catch (error) {
      next(error)
    }
  }
)

router.delete(
  '/:id',
  requireAuth,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const ownerId = req.context.user!.id

      await deleteFiles([id], ownerId)
      sendNoContent(res)
    } catch (error) {
      next(error)
    }
  }
)

export default router
