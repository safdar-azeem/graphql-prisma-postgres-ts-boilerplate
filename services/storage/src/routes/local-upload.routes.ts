import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import { getLocalProvider } from '../providers/index.js'
import { STORAGE_TYPE } from '../constants/index.js'
import { sendSuccess, sendError } from '../utils/response.util.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
})

interface MulterRequest extends Request {
  file?: Express.Multer.File
}

router.put(
  '/upload',
  upload.single('file'),
  async (req: MulterRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (STORAGE_TYPE !== 'local') {
        sendError(res, 'Local upload endpoint only available for local storage', 400)
        return
      }

      const token = req.query.token as string
      if (!token) {
        sendError(res, 'Missing upload token', 400)
        return
      }

      const provider = getLocalProvider()
      if (!provider) {
        sendError(res, 'Local provider not available', 500)
        return
      }

      const tokenData = provider.validateUploadToken(token)
      if (!tokenData) {
        sendError(res, 'Invalid or expired upload token', 401)
        return
      }

      if (!req.file) {
        sendError(res, 'No file provided', 400)
        return
      }

      await provider.saveFile(tokenData.key, req.file.buffer)
      provider.consumeUploadToken(token)

      sendSuccess(res, { uploaded: true, key: tokenData.key })
    } catch (error) {
      next(error)
    }
  }
)

router.get('/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (STORAGE_TYPE !== 'local') {
      sendError(res, 'Local download endpoint only available for local storage', 400)
      return
    }

    const token = req.query.token as string
    if (!token) {
      sendError(res, 'Missing download token', 400)
      return
    }

    const provider = getLocalProvider()
    if (!provider) {
      sendError(res, 'Local provider not available', 500)
      return
    }

    const tokenData = provider.validateDownloadToken(token)
    if (!tokenData) {
      sendError(res, 'Invalid or expired download token', 401)
      return
    }

    const filePath = await provider.getFilePath(tokenData.key)
    const filename = path.basename(tokenData.key)

    res.download(filePath, filename)
  } catch (error) {
    next(error)
  }
})

export default router
