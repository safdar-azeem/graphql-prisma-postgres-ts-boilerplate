import { Router, Request, Response, NextFunction } from 'express'
import { getShareLinkByToken, getSharedFolderContents } from '../services/share-link.service.js'
import { getStorageProvider } from '../providers/index.js'
import { prisma } from '../config/prisma.js'
import { sendError } from '../utils/response.util.js'
import { generateSharedFolderHtml } from '../utils/htmlTemplates.js'
import type { Readable } from 'stream'

const router = Router()

// Helper to stream file content (Proxy)
const streamFileResponse = async (
  res: Response,
  storageKey: string,
  meta: {
    mimeType: string
    size: number
    filename: string
    download?: boolean
  }
) => {
  try {
    const provider = getStorageProvider()
    const stream = await provider.getFileStream(storageKey)

    res.setHeader('Content-Type', meta.mimeType)
    res.setHeader('Content-Length', meta.size)
    
    // Cache for performance (1 hour)
    res.setHeader('Cache-Control', 'public, max-age=3600')

    // Disposition: 'attachment' forces download, 'inline' shows in browser
    const disposition = meta.download ? 'attachment' : 'inline'
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(meta.filename)}"`
    )

    stream.pipe(res)
    
    stream.on('error', (err) => {
      console.error('Stream error:', err)
      if (!res.headersSent) res.status(500).end()
    })
  } catch (error) {
    console.error('Proxy error:', error)
    if (!res.headersSent) res.status(404).send('File not found or inaccessible')
  }
}

// 1. Access Shared Resource (File or Folder Root)
router.get(
  '/:token',
  async (req: Request<{ token: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params
      const subPath = req.query.path as string | undefined

      const shareLink = await getShareLinkByToken(token)

      if (!shareLink) {
        res.status(404).send(generateSharedFolderHtml('Link Expired', '', [], [], token, true))
        return
      }

      // CASE A: Shared Resource is a FILE
      if (shareLink.fileId && shareLink.file) {
        // Proxy the file content directly (No Redirect)
        await streamFileResponse(res, shareLink.file.storageKey, {
          mimeType: shareLink.file.mimeType,
          size: shareLink.file.size,
          filename: shareLink.file.originalName,
          download: false // Show inline by default for main link
        })
        return
      }

      // CASE B: Shared Resource is a FOLDER
      if (shareLink.folderId) {
        try {
          const contents = await getSharedFolderContents(shareLink.folderId, subPath)
          
          const html = generateSharedFolderHtml(
            contents.folder.name,
            contents.folder.path,
            contents.files,
            contents.subfolders,
            token,
            false,
            subPath
          )
          
          res.send(html)
          return
        } catch (err) {
           res.status(404).send('Folder path not found')
           return
        }
      }

      sendError(res, 'Invalid share link configuration', 400)
    } catch (error) {
      next(error)
    }
  }
)

// 2. Download Shared File (Forced Download)
router.get(
  '/:token/download',
  async (req: Request<{ token: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params
      const shareLink = await getShareLinkByToken(token)

      if (!shareLink || !shareLink.fileId || !shareLink.file) {
        res.status(404).send('File not found')
        return
      }

      await streamFileResponse(res, shareLink.file.storageKey, {
        mimeType: shareLink.file.mimeType,
        size: shareLink.file.size,
        filename: shareLink.file.originalName,
        download: true // Force download
      })
    } catch (error) {
      next(error)
    }
  }
)

// 3. Access/Download File inside a Shared Folder
router.get(
  '/:token/file/:fileId',
  async (
    req: Request<{ token: string; fileId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { token, fileId } = req.params
      const download = req.query.download === 'true'

      const shareLink = await getShareLinkByToken(token)

      if (!shareLink || !shareLink.folderId) {
        res.status(404).send('Invalid share link')
        return
      }

      // Security: Ensure file actually belongs to the shared folder tree
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: { folder: true },
      })

      if (!file || file.status !== 'UPLOADED') {
        res.status(404).send('File not found')
        return
      }

      // Get Root Shared Folder
      const rootFolder = await prisma.folder.findUnique({
        where: { id: shareLink.folderId },
      })

      if (!rootFolder) {
        res.status(404).send('Shared folder no longer exists')
        return
      }

      // Check hierarchy: File must be directly in folder OR in a subfolder of root
      const isAuthorized = 
        file.folderId === rootFolder.id || 
        (file.folder && file.folder.path.startsWith(rootFolder.path + '/'))

      if (!isAuthorized) {
        res.status(403).send('Access denied to this file')
        return
      }

      // Proxy the file content
      await streamFileResponse(res, file.storageKey, {
        mimeType: file.mimeType,
        size: file.size,
        filename: file.originalName,
        download: download
      })

    } catch (error) {
      next(error)
    }
  }
)

export default router
