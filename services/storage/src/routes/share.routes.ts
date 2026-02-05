import { Router, Request, Response, NextFunction } from 'express'
import { getShareLinkByToken, getSharedFolderContents } from '../services/share-link.service.js'
import { getStorageProvider } from '../providers/index.js'
import { prisma } from '../config/prisma.js'
import { sendError } from '../utils/response.util.js'
import { PORT } from '../constants/index.js'

const router = Router()

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const generateFolderHtml = (
  folderName: string,
  folderPath: string,
  files: { id: string; originalName: string; mimeType: string; size: number }[],
  subfolders: { id: string; name: string }[],
  shareToken: string,
  currentSubPath?: string
): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  const breadcrumbs = currentSubPath ? currentSubPath.split('/') : []

  let breadcrumbHtml = `<a href="${baseUrl}/api/share/${shareToken}">${folderName}</a>`
  let pathSoFar = ''
  for (const crumb of breadcrumbs) {
    pathSoFar += (pathSoFar ? '/' : '') + crumb
    breadcrumbHtml += ` / <a href="${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(pathSoFar)}">${crumb}</a>`
  }

  const fileRows = files
    .map(
      (file) => `
    <tr>
      <td>📄 ${file.originalName}</td>
      <td>${file.mimeType}</td>
      <td>${formatFileSize(file.size)}</td>
      <td><a href="${baseUrl}/api/share/${shareToken}/file/${file.id}" class="download-btn">Download</a></td>
    </tr>
  `
    )
    .join('')

  const folderRows = subfolders
    .map((folder) => {
      const subPath = currentSubPath ? `${currentSubPath}/${folder.name}` : folder.name
      return `
    <tr>
      <td>📁 <a href="${baseUrl}/api/share/${shareToken}?path=${encodeURIComponent(subPath)}">${folder.name}</a></td>
      <td>Folder</td>
      <td>-</td>
      <td>-</td>
    </tr>
  `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shared Folder - ${folderName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 2rem;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 2rem;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h1 { 
      color: #fff;
      margin-bottom: 0.5rem;
      font-size: 1.75rem;
    }
    .breadcrumb {
      color: #888;
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }
    .breadcrumb a {
      color: #64b5f6;
      text-decoration: none;
    }
    .breadcrumb a:hover { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    th {
      background: rgba(255, 255, 255, 0.05);
      color: #aaa;
      font-weight: 500;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    tr:hover { background: rgba(255, 255, 255, 0.03); }
    td a { color: #64b5f6; text-decoration: none; }
    td a:hover { text-decoration: underline; }
    .download-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white !important;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      text-decoration: none !important;
    }
    .empty {
      text-align: center;
      color: #666;
      padding: 3rem;
    }
    .stats {
      display: flex;
      gap: 2rem;
      margin-bottom: 1.5rem;
      color: #888;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📁 ${currentSubPath ? currentSubPath.split('/').pop() : folderName}</h1>
    <div class="breadcrumb">${breadcrumbHtml}</div>
    <div class="stats">
      <span>📁 ${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}</span>
      <span>📄 ${files.length} file${files.length !== 1 ? 's' : ''}</span>
    </div>
    ${
      files.length === 0 && subfolders.length === 0
        ? '<div class="empty">This folder is empty</div>'
        : `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Size</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${folderRows}
        ${fileRows}
      </tbody>
    </table>
    `
    }
  </div>
</body>
</html>`
}

// View shared resource (file downloads or folder shows HTML)
router.get(
  '/:token',
  async (req: Request<{ token: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params
      const subPath = req.query.path as string | undefined

      const shareLink = await getShareLinkByToken(token)

      if (!shareLink) {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Link Expired</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 3rem;">
            <h1>🔗 Link Not Found or Expired</h1>
            <p>This share link is no longer valid.</p>
          </body>
          </html>
        `)
        return
      }

      // If it's a file share, redirect to download
      if (shareLink.fileId && shareLink.file) {
        res.redirect(`/api/share/${token}/download`)
        return
      }

      // If it's a folder share, show HTML page
      if (shareLink.folderId) {
        const contents = await getSharedFolderContents(shareLink.folderId, subPath)
        const html = generateFolderHtml(
          contents.folder.name,
          contents.folder.path,
          contents.files,
          contents.subfolders,
          token,
          subPath
        )
        res.type('html').send(html)
        return
      }

      sendError(res, 'Invalid share link', 400)
    } catch (error) {
      next(error)
    }
  }
)

// Download shared file directly
router.get(
  '/:token/download',
  async (req: Request<{ token: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params

      const shareLink = await getShareLinkByToken(token)

      if (!shareLink || !shareLink.fileId) {
        sendError(res, 'Share link not found or expired', 404)
        return
      }

      const file = await prisma.file.findUnique({
        where: { id: shareLink.fileId },
      })

      if (!file || file.status !== 'UPLOADED') {
        sendError(res, 'File not available', 404)
        return
      }

      const provider = getStorageProvider()
      const signedUrl = await provider.generateSignedDownloadUrl({
        key: file.storageKey,
        expiresInSeconds: 300, // 5 minutes
      })

      // Redirect to the signed URL (hidden from user as it's a redirect)
      res.redirect(signedUrl.signedUrl)
    } catch (error) {
      next(error)
    }
  }
)

// Download file from shared folder
router.get(
  '/:token/file/:fileId',
  async (
    req: Request<{ token: string; fileId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { token, fileId } = req.params

      const shareLink = await getShareLinkByToken(token)

      if (!shareLink || !shareLink.folderId) {
        sendError(res, 'Share link not found or expired', 404)
        return
      }

      // Verify file belongs to the shared folder or its subfolders
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: { folder: true },
      })

      if (!file || file.status !== 'UPLOADED') {
        sendError(res, 'File not available', 404)
        return
      }

      // Check if file is in the shared folder or a subfolder
      const sharedFolder = await prisma.folder.findUnique({
        where: { id: shareLink.folderId },
      })

      if (!sharedFolder) {
        sendError(res, 'Folder not found', 404)
        return
      }

      const isInSharedFolder =
        file.folderId === shareLink.folderId ||
        (file.folder && file.folder.path.startsWith(sharedFolder.path + '/'))

      if (!isInSharedFolder) {
        sendError(res, 'File not in shared folder', 403)
        return
      }

      const provider = getStorageProvider()
      const signedUrl = await provider.generateSignedDownloadUrl({
        key: file.storageKey,
        expiresInSeconds: 300,
      })

      res.redirect(signedUrl.signedUrl)
    } catch (error) {
      next(error)
    }
  }
)

export default router
