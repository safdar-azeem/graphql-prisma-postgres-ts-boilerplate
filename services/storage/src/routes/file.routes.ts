import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { sendSuccess, sendNoContent } from '../utils/response.util.js'
import {
  getFileById,
  getFiles,
  getFileDownloadUrl,
  deleteFiles,
  toggleFilePublic,
  updateFile,
} from '../services/file.service.js'

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
      const ownerId = req.context.user!.id
      const { page, limit, search, uploadedBy, folderId, dateFrom, dateTo } = req.query

      const filter = {
        search: search || null,
        uploadedBy: uploadedBy || null,
        folderId: folderId === 'null' ? null : folderId || null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
      }

      const pagination = {
        page: page ? parseInt(page) : 1,
        limit: limit ? Math.min(parseInt(limit), 100) : 10,
      }

      const result = await getFiles(ownerId, filter, pagination)
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

// Keep single delete for backwards compatibility
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
