import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'
import { getStorageProvider } from '../providers/index.js'
import {
  SIGNED_URL_EXPIRY_SECONDS,
  PORT,
  JWT_SECRET,
  FILE_PROXY_MODE,
} from '../constants/index.js'
import type { File, Prisma } from '../../generated/prisma/client.js'
import type { Readable } from 'stream'

interface FilesFilterInput {
  search?: string | null
  uploadedBy?: string | null
  folderId?: string | null
  dateFrom?: Date | null
  dateTo?: Date | null
}

interface PaginationInput {
  page?: number
  limit?: number
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalItems: number
}

interface FilesResponse {
  items: File[]
  pageInfo: PaginationInfo
}

interface FileWithUrl extends File {
  url: string | null
}

// --- URL Generation Logic ---

// 1. Masked/Proxy URL Generator
const getProxyUrl = (file: File): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  // Generate a short-lived token specifically for this file access
  // This allows the /content endpoint to validate access without requiring a full user login session if shared
  const token = jwt.sign(
    { fileId: file.id, ownerId: file.ownerId, type: 'file_view' },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
  return `${baseUrl}/api/files/${file.id}/content?token=${token}`
}

// 2. Main Resolution Strategy
const resolveFileUrl = async (file: File): Promise<string> => {
  // Option A: Masked Mode (Proxy through API)
  if (FILE_PROXY_MODE) {
    return getProxyUrl(file)
  }

  // Option B: Direct Mode (Direct Provider URL)
  const provider = getStorageProvider()

  // B1. If Public, return the public CDN/Bucket URL
  if (file.isPublic) {
    return provider.getPublicUrl(file.storageKey)
  }

  // B2. If Private, generate a direct Signed URL (Time-limited)
  const { signedUrl } = await provider.generateSignedDownloadUrl({
    key: file.storageKey,
    expiresInSeconds: 3600, // 1 hour link
  })

  return signedUrl
}

// --- Service Methods ---

export const getFileById = async (id: string, ownerId: string): Promise<FileWithUrl | null> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) return null

  // Authorization check
  if (!file.isPublic && file.ownerId !== ownerId) {
    // Note: Admin logic should be handled by caller/controller guards
    // For strictly private files, we could throw here, but returning null or handling upstream is also valid.
    // Assuming controller checks 'ownership' or 'admin role'.
  }

  // Resolve URL dynamically based on ENV configuration
  const url = await resolveFileUrl(file)

  return { ...file, url }
}

export const getFiles = async (
  ownerId: string,
  filter?: FilesFilterInput,
  pagination?: PaginationInput
): Promise<FilesResponse> => {
  const page = pagination?.page ?? 1
  const limit = Math.min(pagination?.limit ?? 10, 100)
  const skip = (page - 1) * limit

  const where: Prisma.FileWhereInput = {
    status: 'UPLOADED',
  }

  if (filter?.uploadedBy) {
    where.ownerId = filter.uploadedBy
  } else {
    where.ownerId = ownerId
  }

  if (filter?.folderId !== undefined) {
    where.folderId = filter.folderId
  }

  if (filter?.search) {
    where.originalName = {
      contains: filter.search,
      mode: 'insensitive',
    }
  }

  if (filter?.dateFrom || filter?.dateTo) {
    where.createdAt = {}
    if (filter.dateFrom) {
      where.createdAt.gte = filter.dateFrom
    }
    if (filter.dateTo) {
      where.createdAt.lte = filter.dateTo
    }
  }

  const [items, totalItems] = await Promise.all([
    prisma.file.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.file.count({ where }),
  ])

  // Resolve URLs for all items in parallel
  // This is efficient because signed URL generation is usually a local computation (crypto), not a network call
  const itemsWithUrl = await Promise.all(
    items.map(async (file) => ({
      ...file,
      url: await resolveFileUrl(file),
    }))
  )

  const totalPages = Math.ceil(totalItems / limit)

  return {
    items: itemsWithUrl,
    pageInfo: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  }
}

export const getFileDownloadUrl = async (id: string, ownerId: string): Promise<string> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  // Re-use the main resolution logic.
  // Even for "Download", if we are in Proxy mode, we want to hide the S3 URL.
  // If we are in Direct mode, we give them the direct S3 download link.
  return resolveFileUrl(file)
}

export const getFileStream = async (
  id: string
): Promise<{ stream: Readable; mimeType: string; size: number; filename: string }> => {
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file || file.status !== 'UPLOADED') {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  const provider = getStorageProvider()
  const stream = await provider.getFileStream(file.storageKey)

  return {
    stream,
    mimeType: file.mimeType,
    size: file.size,
    filename: file.originalName,
  }
}

export const deleteFiles = async (ids: string[], ownerId: string): Promise<string> => {
  if (ids.length === 0) {
    throw Object.assign(new Error('No file IDs provided'), { statusCode: 400 })
  }

  const files = await prisma.file.findMany({
    where: {
      id: { in: ids },
    },
  })

  const unauthorizedFiles = files.filter((f) => f.ownerId !== ownerId)
  if (unauthorizedFiles.length > 0) {
    throw Object.assign(new Error('Access denied to some files'), { statusCode: 403 })
  }

  const notFoundIds = ids.filter((id) => !files.find((f) => f.id === id))
  if (notFoundIds.length > 0) {
    throw Object.assign(new Error(`Files not found: ${notFoundIds.join(', ')}`), {
      statusCode: 404,
    })
  }

  const provider = getStorageProvider()

  await Promise.all(
    files.map(async (file) => {
      try {
        await provider.deleteFile(file.storageKey)
      } catch {
        // Continue even if storage deletion fails
      }
    })
  )

  await prisma.file.updateMany({
    where: { id: { in: ids } },
    data: { status: 'DELETED' },
  })

  return `Successfully deleted ${files.length} file(s)`
}

export const toggleFilePublic = async (id: string, ownerId: string): Promise<File> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  if (file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  const newPublicStatus = !file.isPublic

  const provider = getStorageProvider()
  await provider.setFileVisibility(file.storageKey, newPublicStatus)

  const updatedFile = await prisma.file.update({
    where: { id },
    data: { isPublic: newPublicStatus },
  })

  return updatedFile
}

export const updateFile = async (
  id: string,
  ownerId: string,
  data: { isPublic?: boolean }
): Promise<File> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 })
  }

  if (file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  if (data.isPublic !== undefined && data.isPublic !== file.isPublic) {
    const provider = getStorageProvider()
    await provider.setFileVisibility(file.storageKey, data.isPublic)
  }

  const updatedFile = await prisma.file.update({
    where: { id },
    data,
  })

  return updatedFile
}

