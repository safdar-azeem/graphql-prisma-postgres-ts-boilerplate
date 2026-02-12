import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { sendSuccess, sendCreated, sendNoContent } from '../utils/response.util.js'
import {
  createFolder,
  getFolderById,
  getFolders,
  renameFolder,
  moveFolder,
  deleteFolder,
} from '../services/folder.service.js'

const router = Router()

interface FoldersQuery {
  page?: string
  limit?: string
  search?: string
  parentId?: string
}

router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, parentId, isPublic } = req.body
      const ownerId = req.context.user!.id

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: name',
        })
        return
      }

      const folder = await createFolder({
        name,
        parentId,
        isPublic,
        ownerId,
      })

      sendCreated(res, folder)
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/',
  requireAuth,
  async (
    req: Request<object, object, object, FoldersQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const ownerId = req.context.user!.id
      const { page, limit, search, parentId } = req.query

      // 1. Parse Parent ID logic (Mirroring File Route Logic)
      // - 'null' -> Root Level (parentId = null)
      // - undefined -> Global Search (Ignore parentId constraint)
      // - UUID -> Specific Subfolder
      let parsedParentId: string | null | undefined = undefined
      if (parentId === 'null') {
        parsedParentId = null
      } else if (typeof parentId === 'string') {
        parsedParentId = parentId
      }

      const filter = {
        search: search || null,
        parentId: parsedParentId,
      }

      const pagination = {
        page: page ? parseInt(page) : 1,
        limit: limit ? Math.min(parseInt(limit), 100) : 10,
      }

      const result = await getFolders(ownerId, filter, pagination)
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

      const folder = await getFolderById(id, ownerId)

      if (!folder) {
        res.status(404).json({
          success: false,
          error: 'Folder not found',
        })
        return
      }

      sendSuccess(res, folder)
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
      const { name, parentId } = req.body
      const ownerId = req.context.user!.id

      let folder

      if (name !== undefined) {
        folder = await renameFolder(id, name, ownerId)
      }

      if (parentId !== undefined) {
        folder = await moveFolder(id, parentId, ownerId)
      }

      if (!folder) {
        res.status(400).json({
          success: false,
          error: 'No update fields provided',
        })
        return
      }

      sendSuccess(res, folder)
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

      await deleteFolder(id, ownerId)
      sendNoContent(res)
    } catch (error) {
      next(error)
    }
  }
)

export default router
