import { prisma } from '../config/prisma.js'
import { getStorageProvider } from '../providers/index.js'
import { PORT, FILE_PROXY_MODE } from '../constants/index.js'
import { getPagination, getPageInfo, getDateRangeFilter } from '../utils/query.util.js'
import type { File, Prisma } from '../../generated/prisma/client.js'
import type { Readable } from 'stream'

interface FilesFilterInput {
  uploadedBy?: string | null
  folderId?: string | null
  dateRange?: {
    from?: Date | null
    to?: Date | null
  } | null
}

interface PaginationInput {
  page?: number | null
  limit?: number | null
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

const getProxyUrl = (file: File): string => {
  const baseUrl = process.env.STORAGE_PUBLIC_URL || `http://localhost:${PORT}`
  return `${baseUrl}/api/files/${file.id}/content`
}

export const resolveFileUrl = async (file: File): Promise<string> => {
  if (FILE_PROXY_MODE) {
    return getProxyUrl(file)
  }

  const provider = getStorageProvider()

  if (file.isPublic) {
    return provider.getPublicUrl(file.storageKey)
  }

  const { signedUrl } = await provider.generateSignedDownloadUrl({
    key: file.storageKey,
    expiresInSeconds: 3600,
  })

  return signedUrl
}

export const getFileById = async (id: string, ownerId: string): Promise<FileWithUrl | null> => {
  const file = await prisma.file.findUnique({
    where: { id },
  })

  if (!file) return null

  if (!file.isPublic && file.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  const url = await resolveFileUrl(file)
  return { ...file, url }
}

export const getFiles = async (
  ownerId: string,
  pagination?: PaginationInput | null,
  search?: string | null,
  filter?: FilesFilterInput | null
): Promise<FilesResponse> => {
  const { page, limit, skip } = getPagination(pagination)

  const where: Prisma.FileWhereInput = {
    status: 'UPLOADED',
  }

  if (filter?.uploadedBy) {
    where.ownerId = filter.uploadedBy
  } else {
    where.ownerId = ownerId
  }

  // Defensive programming: 
  // If folderId is explicitly passed, use it.
  // Else if we are NOT searching globally, default to fetching root files (folderId = null).
  if (filter?.folderId !== undefined) {
    where.folderId = filter.folderId
  } else if (!search) {
    where.folderId = null
  }

  if (search) {
    where.originalName = {
      contains: search,
      mode: 'insensitive',
    }
  }

  const dateFilter = getDateRangeFilter(filter?.dateRange)
  if (dateFilter) {
    where.createdAt = dateFilter
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

  const itemsWithUrl = await Promise.all(
    items.map(async (file) => ({
      ...file,
      url: await resolveFileUrl(file),
    }))
  )

  return {
    items: itemsWithUrl,
    pageInfo: getPageInfo(totalItems, limit, page),
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

  const deletionErrors: { fileId: string; storageKey: string; error: string }[] = []
  await Promise.all(
    files.map(async (file) => {
      try {
        await provider.deleteFile(file.storageKey)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        deletionErrors.push({ fileId: file.id, storageKey: file.storageKey, error: message })
        console.error(`[Storage] Failed to delete file from provider:`, {
          fileId: file.id,
          storageKey: file.storageKey,
          error: message,
        })
      }
    })
  )

  if (deletionErrors.length > 0) {
    console.warn(
      `[Storage] ${deletionErrors.length}/${files.length} file(s) failed to delete from provider. ` +
        `DB records marked DELETED but storage objects may be orphaned.`
    )
  }

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
