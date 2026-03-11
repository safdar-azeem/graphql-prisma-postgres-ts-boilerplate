import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { sendSuccess, sendCreated, sendNoContent } from '../utils/response.util.js'
import {
  createShareLink,
  getFileShareLinks,
  getFolderShareLinks,
  deleteShareLink,
} from '../services/share-link.service.js'
import { PORT } from '../constants/index.js'

const router = Router()

const getShareUrl = (token: string): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  return `${baseUrl}/api/share/${token}`
}

router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileId, folderId, expiresInMinutes, maxViews, password } = req.body
      const ownerId = req.context.user!.id

      if (!fileId && !folderId) {
        res.status(400).json({
          success: false,
          error: 'Either fileId or folderId is required',
        })
        return
      }

      const shareLink = await createShareLink({
        fileId,
        folderId,
        ownerId,
        expiresInMinutes,
        maxViews,
        password,
      })

      sendCreated(res, {
        ...shareLink,
        url: getShareUrl(shareLink.token),
        hasPassword: !!password,
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/file/:fileId',
  requireAuth,
  async (req: Request<{ fileId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileId } = req.params
      const ownerId = req.context.user!.id
      const { page, limit, search, dateFrom, dateTo } = req.query

      const pagination = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
      }

      const filter = {
        dateRange: {
          from: dateFrom ? new Date(dateFrom as string) : null,
          to: dateTo ? new Date(dateTo as string) : null,
        }
      }

      const result = await getFileShareLinks(fileId, ownerId, pagination, search as string, filter)

      const linksWithUrls = result.items.map((link) => ({
        ...link,
        url: getShareUrl(link.token),
      }))

      sendSuccess(res, { items: linksWithUrls, pageInfo: result.pageInfo })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/folder/:folderId',
  requireAuth,
  async (req: Request<{ folderId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { folderId } = req.params
      const ownerId = req.context.user!.id
      const { page, limit, search, dateFrom, dateTo } = req.query

      const pagination = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
      }

      const filter = {
        dateRange: {
          from: dateFrom ? new Date(dateFrom as string) : null,
          to: dateTo ? new Date(dateTo as string) : null,
        }
      }

      const result = await getFolderShareLinks(folderId, ownerId, pagination, search as string, filter)

      const linksWithUrls = result.items.map((link) => ({
        ...link,
        url: getShareUrl(link.token),
      }))

      sendSuccess(res, { items: linksWithUrls, pageInfo: result.pageInfo })
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

      await deleteShareLink(id, ownerId)
      sendNoContent(res)
    } catch (error) {
      next(error)
    }
  }
)

export default router
