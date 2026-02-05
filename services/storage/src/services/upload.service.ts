import { prisma } from '../config/prisma.js'
import { getStorageProvider } from '../providers/index.js'
import { generateStorageKey } from '../utils/path.util.js'
import { SIGNED_URL_EXPIRY_SECONDS, STORAGE_TYPE } from '../constants/index.js'
import type { File } from '../../generated/prisma/client.js'

interface CreateSignedUrlInput {
  filename: string
  mimeType: string
  size: number
  folderId?: string | null
  isPublic?: boolean
  ownerId: string
}

interface SignedUrlResponse {
  signedUrl: string
  fileId: string
  publicUrl: string
  storageKey: string
  expiresAt: Date
}

export const createSignedUploadUrl = async (
  input: CreateSignedUrlInput
): Promise<SignedUrlResponse> => {
  const { filename, mimeType, size, folderId, isPublic = false, ownerId } = input

  let folderPath: string | null = null

  if (folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { path: true, ownerId: true },
    })

    if (!folder) {
      throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
    }

    if (folder.ownerId !== ownerId) {
      throw Object.assign(new Error('Access denied to folder'), { statusCode: 403 })
    }

    folderPath = folder.path
  }

  const storageKey = generateStorageKey(ownerId, folderPath, filename)
  const provider = getStorageProvider()

  const signedUrlResult = await provider.generateSignedUploadUrl({
    key: storageKey,
    contentType: mimeType,
    expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
  })

  const file = await prisma.file.create({
    data: {
      filename: storageKey.split('/').pop() || filename,
      originalName: filename,
      mimeType,
      size,
      storageKey,
      provider: STORAGE_TYPE,
      status: 'PENDING',
      folderId,
      ownerId,
      isPublic,
      expiresAt: signedUrlResult.expiresAt,
    },
  })

  return {
    signedUrl: signedUrlResult.signedUrl,
    fileId: file.id,
    publicUrl: signedUrlResult.publicUrl,
    storageKey,
    expiresAt: signedUrlResult.expiresAt,
  }
}

export const confirmUpload = async (fileId: string, ownerId: string): Promise<File> => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  if (file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  if (file.status !== 'PENDING') {
    throw Object.assign(new Error('File upload already processed'), { statusCode: 400 })
  }

  const provider = getStorageProvider()
  const exists = await provider.fileExists(file.storageKey)

  if (!exists) {
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'FAILED' },
    })
    throw Object.assign(new Error('File not found in storage'), { statusCode: 400 })
  }

  const updatedFile = await prisma.file.update({
    where: { id: fileId },
    data: {
      status: 'UPLOADED',
      expiresAt: null,
    },
  })

  return updatedFile
}

export const cancelUpload = async (fileId: string, ownerId: string): Promise<boolean> => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  if (file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  if (file.status !== 'PENDING') {
    throw Object.assign(new Error('Can only cancel pending uploads'), { statusCode: 400 })
  }

  const provider = getStorageProvider()
  try {
    await provider.deleteFile(file.storageKey)
  } catch {
    // Ignore errors when deleting non-existent files
  }

  await prisma.file.delete({
    where: { id: fileId },
  })

  return true
}

export const cleanupExpiredPendingFiles = async (): Promise<number> => {
  const expiredFiles = await prisma.file.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        lt: new Date(),
      },
    },
  })

  const provider = getStorageProvider()

  const deletePromises = expiredFiles.map(async (file) => {
    try {
      await provider.deleteFile(file.storageKey)
    } catch {
      // Ignore errors when deleting
    }
  })

  await Promise.all(deletePromises)

  await prisma.file.deleteMany({
    where: {
      id: { in: expiredFiles.map((f) => f.id) },
    },
  })

  return expiredFiles.length
}
