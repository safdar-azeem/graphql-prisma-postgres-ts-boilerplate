import crypto from 'crypto'
import { prisma } from '../config/prisma.js'
import type { ShareLink } from '../../generated/prisma/client.js'

interface CreateShareLinkInput {
  fileId?: string | null
  folderId?: string | null
  ownerId: string
  expiresInMinutes?: number
  maxViews?: number | null
  password?: string | null
}

interface ShareLinkWithResource extends ShareLink {
  file?: {
    id: string
    originalName: string
    mimeType: string
    size: number
    storageKey: string
    status: string
  } | null
  folder?: { id: string; name: string; path: string } | null
}

const DEFAULT_EXPIRY_MINUTES = 60 * 24 * 7 // 7 days

export const createShareLink = async (input: CreateShareLinkInput): Promise<ShareLink> => {
  const {
    fileId,
    folderId,
    ownerId,
    expiresInMinutes = DEFAULT_EXPIRY_MINUTES,
    maxViews,
    password,
  } = input

  if (!fileId && !folderId) {
    throw Object.assign(new Error('Either fileId or folderId is required'), { statusCode: 400 })
  }

  if (fileId && folderId) {
    throw Object.assign(new Error('Cannot share both file and folder'), { statusCode: 400 })
  }

  // Verify ownership
  if (fileId) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { ownerId: true, status: true },
    })

    if (!file) {
      throw Object.assign(new Error('File not found'), { statusCode: 404 })
    }

    if (file.ownerId !== ownerId) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 })
    }

    if (file.status !== 'UPLOADED') {
      throw Object.assign(new Error('File not available for sharing'), { statusCode: 400 })
    }
  }

  if (folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { ownerId: true },
    })

    if (!folder) {
      throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
    }

    if (folder.ownerId !== ownerId) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 })
    }
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)

  // Hash password if provided
  const hashedPassword = password
    ? crypto.createHash('sha256').update(password).digest('hex')
    : null

  const shareLink = await prisma.shareLink.create({
    data: {
      fileId,
      folderId,
      ownerId,
      expiresAt,
      maxViews: maxViews ?? null,
      password: hashedPassword,
    },
  })

  return shareLink
}

export const getShareLinkByToken = async (token: string): Promise<ShareLinkWithResource | null> => {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          storageKey: true,
          status: true,
        },
      },
      folder: {
        select: { id: true, name: true, path: true },
      },
    },
  })

  if (!shareLink) return null

  // Check expiration
  if (new Date() > shareLink.expiresAt) {
    return null
  }

  // Check max views
  if (shareLink.maxViews !== null && shareLink.views >= shareLink.maxViews) {
    return null
  }

  return shareLink
}

// Verify password for password-protected share links
export const verifyShareLinkPassword = (shareLink: ShareLink, password: string): boolean => {
  if (!shareLink.password) return true // No password set
  const hashedInput = crypto.createHash('sha256').update(password).digest('hex')
  return hashedInput === shareLink.password
}

// Increment view count atomically
export const incrementShareLinkViews = async (id: string): Promise<void> => {
  await prisma.shareLink.update({
    where: { id },
    data: { views: { increment: 1 } },
  })
}

export const getFileShareLinks = async (fileId: string, ownerId: string): Promise<ShareLink[]> => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  if (file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  const shareLinks = await prisma.shareLink.findMany({
    where: {
      fileId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  return shareLinks
}

export const getFolderShareLinks = async (
  folderId: string,
  ownerId: string
): Promise<ShareLink[]> => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ownerId: true },
  })

  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  if (folder.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  const shareLinks = await prisma.shareLink.findMany({
    where: {
      folderId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  return shareLinks
}

export const deleteShareLink = async (id: string, ownerId: string): Promise<boolean> => {
  const shareLink = await prisma.shareLink.findUnique({
    where: { id },
  })

  if (!shareLink) {
    throw Object.assign(new Error('Share link not found'), { statusCode: 404 })
  }

  if (shareLink.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  await prisma.shareLink.delete({
    where: { id },
  })

  return true
}

export const cleanupExpiredShareLinks = async (): Promise<number> => {
  const result = await prisma.shareLink.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })

  return result.count
}

export const getSharedFolderContents = async (
  folderId: string,
  subPath?: string
): Promise<{
  folder: { id: string; name: string; path: string }
  files: { id: string; originalName: string; mimeType: string; size: number }[]
  subfolders: { id: string; name: string }[]
}> => {
  let targetFolderId = folderId

  if (subPath) {
    const baseFolder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { path: true, ownerId: true },
    })

    if (!baseFolder) {
      throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
    }

    const targetPath = `${baseFolder.path}/${subPath}`
    const targetFolder = await prisma.folder.findFirst({
      where: {
        path: targetPath,
        ownerId: baseFolder.ownerId,
      },
    })

    if (!targetFolder) {
      throw Object.assign(new Error('Subfolder not found'), { statusCode: 404 })
    }

    targetFolderId = targetFolder.id
  }

  const folder = await prisma.folder.findUnique({
    where: { id: targetFolderId },
    select: { id: true, name: true, path: true },
  })

  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  const [files, subfolders] = await Promise.all([
    prisma.file.findMany({
      where: {
        folderId: targetFolderId,
        status: 'UPLOADED',
      },
      select: { id: true, originalName: true, mimeType: true, size: true },
      orderBy: { originalName: 'asc' },
    }),
    prisma.folder.findMany({
      where: { parentId: targetFolderId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return { folder, files, subfolders }
}
