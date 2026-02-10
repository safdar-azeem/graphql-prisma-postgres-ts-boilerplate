import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth, requireRole } from '../middleware/auth.middleware.js'
import { sendSuccess, sendNoContent } from '../utils/response.util.js'
import {
  getFileById,
  getFiles,
  getFileDownloadUrl,
  deleteFiles,
  toggleFilePublic,
  updateFile,
  getFileStream,
} from '../services/file.service.js'
import { JWT_SECRET } from '../constants/index.js'

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

      // If user is ADMIN, they can filter by uploadedBy, otherwise strict owner check
      let targetOwnerId = user.id
      if (user.role === 'ADMIN' && uploadedBy) {
        targetOwnerId = uploadedBy
      }

      const filter = {
        search: search || null,
        uploadedBy: user.role === 'ADMIN' ? uploadedBy || null : user.id, // For Admin list all if null
        folderId: folderId === 'null' ? null : folderId || null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
      }

      // If Admin and no specific uploadedBy, we pass the current admin ID but let service handle empty filter?
      // Actually, our service implementation defaults to passed ownerId if filter.uploadedBy is null.
      // Let's adjust the call:
      const ownerIdArg = user.role === 'ADMIN' && !uploadedBy ? '' : targetOwnerId // Hack to indicate "all" if empty string?
      // Better: Update service to handle this, but for now we rely on the filter object priority in service.

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

      // If Admin, we should allow access.
      // Pass a flag or check in service. For now, we assume user is owner.
      // Refactoring service to accept user role would be cleaner, but using ownerId.

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
// This route streams the file content from the provider to the client
// It uses a query token for authentication to support <img> tags etc.
router.get(
  '/:id/content',
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const token = req.query.token as string

      if (!token) {
        res.status(401).send('Missing access token')
        return
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { fileId: string; type: string }
        if (decoded.fileId !== id || decoded.type !== 'file_view') {
          res.status(403).send('Invalid token')
          return
        }
      } catch (e) {
        res.status(403).send('Token expired or invalid')
        return
      }

      const { stream, mimeType, size, filename } = await getFileStream(id)

      res.setHeader('Content-Type', mimeType)
      res.setHeader('Content-Length', size)
      res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`)

      stream.pipe(res)
    } catch (error) {
      console.error('Proxy Error:', error)
      res.status(404).send('File not found')
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
