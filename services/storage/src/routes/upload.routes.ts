import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { sendSuccess, sendCreated } from '../utils/response.util.js'
import { createSignedUploadUrl, confirmUpload, cancelUpload } from '../services/upload.service.js'

const router = Router()

router.post(
  '/signed-url',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename, mimeType, size, folderId, folderName, isPublic } = req.body
      const ownerId = req.context.user!.id

      if (!filename || !mimeType || !size) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: filename, mimeType, size',
        })
        return
      }

      const result = await createSignedUploadUrl({
        filename,
        mimeType,
        size,
        folderId,
        folderName,
        isPublic,
        ownerId,
      })

      sendCreated(res, result)
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/confirm',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileId } = req.body
      const ownerId = req.context.user!.id

      if (!fileId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: fileId',
        })
        return
      }

      const file = await confirmUpload(fileId, ownerId)
      sendSuccess(res, file)
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/cancel',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileId } = req.body
      const ownerId = req.context.user!.id

      if (!fileId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: fileId',
        })
        return
      }

      await cancelUpload(fileId, ownerId)
      sendSuccess(res, { cancelled: true })
    } catch (error) {
      next(error)
    }
  }
)

export default router
