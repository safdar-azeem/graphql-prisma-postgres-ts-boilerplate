import { prisma } from '../config/prisma.js'
import { getStorageProvider } from '../providers/index.js'
import { SIGNED_URL_EXPIRY_SECONDS, PORT } from '../constants/index.js'
import type { File, Prisma } from '../../generated/prisma/client.js'

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

const getProxyDownloadUrl = (fileId: string, token: string): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  return `${baseUrl}/api/proxy/download/${fileId}?token=${token}`
}

export const getFileById = async (id: string, ownerId: string): Promise<FileWithUrl | null> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) return null

  if (!file.isPublic && file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  // Return null URL - actual download uses getFileDownloadUrl
  return { ...file, url: null }
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
    ownerId,
    status: 'UPLOADED',
  }

  // Apply filters
  if (filter?.folderId !== undefined) {
    where.folderId = filter.folderId
  }

  if (filter?.search) {
    where.originalName = {
      contains: filter.search,
      mode: 'insensitive',
    }
  }

  if (filter?.uploadedBy) {
    where.ownerId = filter.uploadedBy
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

  const totalPages = Math.ceil(totalItems / limit)

  return {
    items,
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

  if (!file.isPublic && file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  if (file.status !== 'UPLOADED') {
    throw Object.assign(new Error('File not available'), { statusCode: 400 })
  }

  const provider = getStorageProvider()
  const signedUrl = await provider.generateSignedDownloadUrl({
    key: file.storageKey,
    expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
  })

  return signedUrl.signedUrl
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

  // Verify ownership
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

  // Delete from storage provider
  await Promise.all(
    files.map(async (file) => {
      try {
        await provider.deleteFile(file.storageKey)
      } catch {
        // Continue even if storage deletion fails
      }
    })
  )

  // Mark as deleted in database
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

  const updatedFile = await prisma.file.update({
    where: { id },
    data: { isPublic: !file.isPublic },
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

  const updatedFile = await prisma.file.update({
    where: { id },
    data,
  })

  return updatedFile
}
