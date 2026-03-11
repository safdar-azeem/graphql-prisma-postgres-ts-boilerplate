import { prisma } from '../config/prisma.js'
import { buildFolderPath, sanitizeFolderName } from '../utils/path.util.js'
import { getPagination, getPageInfo, getDateRangeFilter } from '../utils/query.util.js'
import type { Folder, Prisma } from '../../generated/prisma/client.js'

interface CreateFolderInput {
  name: string
  parentId?: string | null
  isPublic?: boolean
  ownerId: string
}

interface FolderFilterInput {
  parentId?: string | null
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

interface FoldersResponse {
  items: Folder[]
  pageInfo: PaginationInfo
}

interface FolderWithContents extends Folder {
  files: { id: string; filename: string; mimeType: string; size: number }[]
  children: { id: string; name: string }[]
}

export const createFolder = async (input: CreateFolderInput): Promise<Folder> => {
  const { name, parentId, isPublic = false, ownerId } = input

  const sanitizedName = sanitizeFolderName(name)
  if (!sanitizedName) {
    throw Object.assign(new Error('Invalid folder name'), { statusCode: 400 })
  }

  let parentPath: string | null = null

  if (parentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: parentId },
      select: { path: true, ownerId: true },
    })

    if (!parentFolder) {
      throw Object.assign(new Error('Parent folder not found'), { statusCode: 404 })
    }

    if (parentFolder.ownerId !== ownerId) {
      throw Object.assign(new Error('Access denied to parent folder'), { statusCode: 403 })
    }

    parentPath = parentFolder.path
  }

  const folderPath = buildFolderPath(parentPath, sanitizedName)

  const existingFolder = await prisma.folder.findFirst({
    where: {
      path: folderPath,
      ownerId,
    },
  })

  if (existingFolder) {
    throw Object.assign(new Error('Folder already exists'), { statusCode: 409 })
  }

  const folder = await prisma.folder.create({
    data: {
      name: sanitizedName,
      path: folderPath,
      parentId,
      ownerId,
      isPublic,
    },
  })

  return folder
}

export const getFolderById = async (
  id: string,
  ownerId: string
): Promise<FolderWithContents | null> => {
  const folder = await prisma.folder.findUnique({
    where: { id },
    include: {
      files: {
        where: { status: 'UPLOADED' },
        select: { id: true, filename: true, mimeType: true, size: true },
        take: 100,
      },
      children: {
        select: { id: true, name: true },
        take: 100,
      },
    },
  })

  if (!folder) return null

  if (!folder.isPublic && folder.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  return folder
}

export const getFolders = async (
  ownerId: string,
  pagination?: PaginationInput | null,
  search?: string | null,
  filter?: FolderFilterInput | null
): Promise<FoldersResponse> => {
  const { page, limit, skip } = getPagination(pagination)

  const where: Prisma.FolderWhereInput = {
    ownerId,
  }

  // Defensive programming: 
  // If parentId is explicitly passed, use it.
  // Else if we are NOT searching, default to fetching root folders (parentId = null).
  if (filter?.parentId !== undefined) {
    where.parentId = filter.parentId
  } else if (!search) {
    where.parentId = null
  }

  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive',
    }
  }

  const dateFilter = getDateRangeFilter(filter?.dateRange)
  if (dateFilter) {
    where.createdAt = dateFilter
  }

  const [items, totalItems] = await Promise.all([
    prisma.folder.findMany({
      where,
      take: limit,
      skip,
      orderBy: { name: 'asc' },
    }),
    prisma.folder.count({ where }),
  ])

  return {
    items,
    pageInfo: getPageInfo(totalItems, limit, page),
  }
}

export const renameFolder = async (id: string, name: string, ownerId: string): Promise<Folder> => {
  const folder = await prisma.folder.findUnique({
    where: { id },
  })

  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  if (folder.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  const sanitizedName = sanitizeFolderName(name)
  if (!sanitizedName) {
    throw Object.assign(new Error('Invalid folder name'), { statusCode: 400 })
  }

  const oldPath = folder.path
  const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : null
  const newPath = buildFolderPath(parentPath, sanitizedName)

  const existingFolder = await prisma.folder.findFirst({
    where: {
      path: newPath,
      ownerId,
      id: { not: id },
    },
  })

  if (existingFolder) {
    throw Object.assign(new Error('Folder with this name already exists'), { statusCode: 409 })
  }

  const childFolders = await prisma.folder.findMany({
    where: {
      path: { startsWith: `${oldPath}/` },
    },
  })

  const updates = childFolders.map((child) =>
    prisma.folder.update({
      where: { id: child.id },
      data: { path: child.path.replace(oldPath, newPath) },
    })
  )

  await prisma.$transaction([
    prisma.folder.update({
      where: { id },
      data: { name: sanitizedName, path: newPath },
    }),
    ...updates,
  ])

  const updatedFolder = await prisma.folder.findUnique({
    where: { id },
  })

  return updatedFolder!
}

export const moveFolder = async (
  id: string,
  newParentId: string | null,
  ownerId: string
): Promise<Folder> => {
  const folder = await prisma.folder.findUnique({
    where: { id },
  })

  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  if (folder.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  let newParentPath: string | null = null

  if (newParentId) {
    const newParent = await prisma.folder.findUnique({
      where: { id: newParentId },
    })

    if (!newParent) {
      throw Object.assign(new Error('Target folder not found'), { statusCode: 404 })
    }

    if (newParent.ownerId !== ownerId) {
      throw Object.assign(new Error('Access denied to target folder'), { statusCode: 403 })
    }

    if (newParent.path.startsWith(folder.path)) {
      throw Object.assign(new Error('Cannot move folder into its own subfolder'), {
        statusCode: 400,
      })
    }

    newParentPath = newParent.path
  }

  const oldPath = folder.path
  const newPath = buildFolderPath(newParentPath, folder.name)

  const existingFolder = await prisma.folder.findFirst({
    where: {
      path: newPath,
      ownerId,
      id: { not: id },
    },
  })

  if (existingFolder) {
    throw Object.assign(new Error('Folder with this name already exists at destination'), {
      statusCode: 409,
    })
  }

  const childFolders = await prisma.folder.findMany({
    where: {
      path: { startsWith: `${oldPath}/` },
    },
  })

  const updates = childFolders.map((child) =>
    prisma.folder.update({
      where: { id: child.id },
      data: { path: child.path.replace(oldPath, newPath) },
    })
  )

  await prisma.$transaction([
    prisma.folder.update({
      where: { id },
      data: { parentId: newParentId, path: newPath },
    }),
    ...updates,
  ])

  const updatedFolder = await prisma.folder.findUnique({
    where: { id },
  })

  return updatedFolder!
}

export const deleteFolder = async (id: string, ownerId: string): Promise<boolean> => {
  const folder = await prisma.folder.findUnique({
    where: { id },
    include: {
      _count: {
        select: { files: true, children: true },
      },
    },
  })

  if (!folder) {
    throw Object.assign(new Error('Folder not found'), { statusCode: 404 })
  }

  if (folder.ownerId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 })
  }

  if (folder._count.files > 0 || folder._count.children > 0) {
    throw Object.assign(new Error('Folder is not empty'), { statusCode: 400 })
  }

  await prisma.folder.delete({
    where: { id },
  })

  return true
}
