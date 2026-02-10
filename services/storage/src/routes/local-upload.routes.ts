import { Router, Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import { getLocalProvider } from '../providers/index.js'
import { STORAGE_TYPE } from '../constants/index.js'
import { sendSuccess, sendError } from '../utils/response.util.js'

const router = Router()

// Handle Raw Binary PUT requests (Standard for Pre-signed URLs)
router.put(
  '/upload',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      // Stream file directly to disk
      const filePath = await provider.getFilePath(tokenData.key)
      await provider.ensureDir(filePath)

      const writeStream = fs.createWriteStream(filePath)

      req.pipe(writeStream)

      writeStream.on('error', (err) => {
        console.error('File write error:', err)
        sendError(res, 'Failed to write file', 500)
      })

      writeStream.on('finish', () => {
        provider.consumeUploadToken(token)
        sendSuccess(res, { uploaded: true, key: tokenData.key })
      })

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

